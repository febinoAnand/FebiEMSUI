/* ==========================================================================
   Energy Dashboard — Time-of-Day tariff (Energy Cost → Tariff, Instances)
   SLOTS mirrors the current tariff slabs. A tariff instance is one run of a
   slot: e.g. T2 Morning peak on Wed 8 Oct, 06:00–10:00. Mon–Sat use T1–T5
   (T1 runs 22:00 → 06:00 the next day and is counted on the day it starts);
   Sunday is one Flat run 00:00–24:00, so Monday has its own early T1 run
   00:00–06:00.
   Demo mode: energy comes from a plant load profile with steady per-day
   variation (the same numbers on every visit); a backend replaces instances()
   with GET /tariff-instances.
   ========================================================================== */
(function () {
  var SLOTS = {
    T1: { code: "T1", name: "Off-peak (night)", rate: 6.8, cls: "tod--t1", icon: "i-moon" },
    T2: { code: "T2", name: "Morning peak", rate: 9.2, cls: "tod--t2", icon: "i-sunset", peak: true },
    T3: { code: "T3", name: "Solar hours", rate: 7.4, cls: "tod--t3", icon: "i-sun" },
    T4: { code: "T4", name: "Normal", rate: 8.0, cls: "tod--t4", icon: "i-clock" },
    T5: { code: "T5", name: "Evening peak", rate: 9.6, cls: "tod--t5", icon: "i-sunset", peak: true },
    FLAT: { code: "Flat", name: "Sunday flat", rate: 7.2, cls: "", icon: "i-calendar" },
  };
  var DEMAND = 350; // ₹ / kVA / month
  var H = 36e5, DAY = 864e5;
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Average plant load (kW) by hour of a working day; Sunday runs at a base load
  var PROFILE = [58, 55, 54, 54, 56, 62, 96, 118, 128, 132, 136, 138, 134, 140, 148, 150, 144, 132, 118, 112, 104, 92, 74, 64];
  var SUNDAY_KW = 41;

  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function at(day, h) { return new Date(midnight(day).getTime() + h * H); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function dateLabel(d) { return DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]; }
  function seed(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }

  // Slot runs that START on this day
  function runsStarting(day) {
    var dow = day.getDay(), out = [];
    if (dow === 0) return [{ slot: "FLAT", start: at(day, 0), end: at(day, 24) }];
    if (dow === 1) out.push({ slot: "T1", start: at(day, 0), end: at(day, 6), early: true }); // after Sunday's flat day
    out.push({ slot: "T2", start: at(day, 6), end: at(day, 10) }, { slot: "T3", start: at(day, 10), end: at(day, 14) },
      { slot: "T4", start: at(day, 14), end: at(day, 18) }, { slot: "T5", start: at(day, 18), end: at(day, 22) });
    // Saturday night stops at midnight (Sunday is flat); other nights run to 06:00
    out.push({ slot: "T1", start: at(day, 22), end: dow === 6 ? at(day, 24) : at(day, 30) });
    return out;
  }

  function kwAt(t, key) {
    var dow = t.getDay();
    var base = dow === 0 ? SUNDAY_KW : PROFILE[t.getHours()];
    return base * (0.9 + 0.2 * seed(key + t.getHours()));
  }

  function build(r, now) {
    var key = r.start.toDateString() + r.slot + (r.early ? "e" : "");
    var s = SLOTS[r.slot], startMs = r.start.getTime(), endMs = r.end.getTime(), nowMs = now.getTime();
    var status = nowMs >= endMs ? "closed" : nowMs >= startMs ? "running" : "upcoming";
    var upto = Math.min(endMs, nowMs), kwh = 0, peak = 0;
    for (var t = startMs; t < upto; t += H) {
      var part = Math.min(H, upto - t) / H, kw = kwAt(new Date(t), key);
      kwh += kw * part; peak = Math.max(peak, kw * (1.08 + 0.1 * seed(key + "p" + t)));
    }
    var d = r.start, code = "TI-" + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + (r.slot === "FLAT" ? "F" : r.slot) + (r.early ? "E" : "");
    return {
      id: code, slot: s, slotKey: r.slot, start: r.start, end: r.end, early: !!r.early,
      crosses: r.end.getDate() !== r.start.getDate() && r.end.getTime() - midnight(r.end).getTime() > 0,
      hours: (endMs - startMs) / H, elapsed: Math.max(0, Math.min(1, (nowMs - startMs) / (endMs - startMs))),
      status: status, kwh: kwh, cost: kwh * s.rate, peakKw: peak, rate: s.rate,
      date: dateLabel(r.start), time: hhmm(r.start) + " – " + (r.end.getTime() === at(r.start, 24).getTime() ? "24:00" : hhmm(r.end)),
    };
  }

  // All instances starting within [from, to] (dates), newest first
  function instances(fromDay, toDay, now) {
    now = now || new Date();
    var out = [];
    var d = midnight(fromDay), last = midnight(toDay).getTime();
    while (d.getTime() <= last) {
      runsStarting(d).forEach(function (r) { out.push(build(r, now)); });
      d = midnight(new Date(d.getTime() + DAY + 2 * H)); // next day (safe across DST changes)
    }
    return out.sort(function (a, b) { return b.start - a.start; });
  }

  function current(now) {
    now = now || new Date();
    var list = instances(new Date(now.getTime() - DAY), now, now);
    for (var i = 0; i < list.length; i++) if (list[i].status === "running") return list[i];
    return null;
  }

  window.EDTariff = { SLOTS: SLOTS, DEMAND: DEMAND, instances: instances, current: current, dateLabel: dateLabel, hhmm: hhmm, midnight: midnight };

  /* ---------- Small "now" widgets: <span data-tariff-now="name|rate|ends|code"> ---------- */
  function paintNow() {
    var c = current();
    Array.prototype.forEach.call(document.querySelectorAll("[data-tariff-now]"), function (el) {
      var k = el.getAttribute("data-tariff-now");
      if (!c) { el.textContent = "—"; return; }
      el.textContent = k === "name" ? c.slot.code + " · " + c.slot.name : k === "rate" ? "₹" + c.rate.toFixed(2) + " / kWh"
        : k === "ends" ? "until " + c.time.split(" – ")[1] : k === "code" ? c.id : "";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintNow); else paintNow();
  setInterval(paintNow, 60000);
})();
