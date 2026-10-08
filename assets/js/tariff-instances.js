/* ==========================================================================
   Energy Dashboard — Energy Cost → Instances (tariff instances)
   Every run of a Time-of-Day slot in the chosen range: when it ran, the energy
   used, its rate and cost, and peak demand. Uses EDTariff (tariff.js) and the
   meter registry (meter-data.js) for the per-meter split in the detail dialog.
   ========================================================================== */
(function () {
  var T = window.EDTariff, root = document.getElementById("ti-root");
  if (!T || !root) return;
  var DAY = 864e5;
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function rupee(n) { return "₹" + num(n, 0); }

  var range = $("#ti-range"), fSlot = $("#ti-slot"), fStatus = $("#ti-status"), fSearch = $("#ti-search");
  var all = [], shown = [];

  function load() {
    var now = new Date(), days = +range.value || 7;
    all = T.instances(new Date(now.getTime() - (days - 1) * DAY), now, now);
  }

  function slotPill(i) {
    return i.slot.cls ? '<span class="shift-pill ' + i.slot.cls + '">' + i.slot.code + "</span>" : '<span class="tag">Flat</span>';
  }
  var BADGE = { running: '<span class="badge badge--success"><span class="dot dot--live"></span> Running</span>',
    closed: '<span class="badge"><span class="dot"></span> Closed</span>',
    upcoming: '<span class="badge badge--info"><span class="dot"></span> Upcoming</span>' };

  function stats() {
    var done = all.filter(function (i) { return i.status !== "upcoming"; });
    var kwh = 0, cost = 0, peakKwh = 0, peak = null;
    done.forEach(function (i) { kwh += i.kwh; cost += i.cost; if (i.slot.peak) peakKwh += i.kwh; if (!peak || i.peakKw > peak.peakKw) peak = i; });
    var cur = done.filter(function (i) { return i.status === "running"; })[0];
    var days = +range.value || 7;
    $("#ti-stats").innerHTML =
      '<article class="card stat" style="padding:18px 20px"><div class="progress-ring" style="--v:' + (cur ? Math.round(cur.elapsed * 100) : 0) + ';--c:var(--orange)"></div>' +
      "<div><span>Running now</span><strong style=\"font-size:17px;font-family:var(--font)\">" + (cur ? esc(cur.slot.code + " · " + cur.slot.name) : "—") + "</strong>" +
      '<span class="mono">' + (cur ? "₹" + cur.rate.toFixed(2) + "/kWh · " + num(cur.kwh, 0) + " kWh so far" : "") + "</span></div></article>" +
      '<div class="card stat"><span class="stat__icon" style="--c:var(--green)"><i class="ic i-rupee"></i></span><div><strong>' + rupee(cost) + "</strong><span>Energy cost · " + (days === 1 ? "today" : "last " + days + " days") + "</span></div></div>" +
      '<div class="card stat"><span class="stat__icon"><i class="ic i-bolt"></i></span><div><strong>' + num(kwh, 0) + ' <small class="muted" style="font-size:13px">kWh</small></strong><span>Average ₹' + (kwh ? (cost / kwh).toFixed(2) : "0.00") + " / kWh</span></div></div>" +
      '<div class="card stat"><span class="stat__icon" style="--c:var(--rose)"><i class="ic i-trend-up"></i></span><div><strong>' + (kwh ? Math.round(peakKwh / kwh * 100) : 0) + "%</strong><span>Energy in peak slots (T2, T5)" +
      (peak ? " · max " + num(peak.peakKw, 1) + " kW" : "") + "</span></div></div>";

    // By slot
    var by = {};
    done.forEach(function (i) { var b = by[i.slotKey] = by[i.slotKey] || { slot: i.slot, n: 0, kwh: 0, cost: 0, hours: 0 }; b.n++; b.kwh += i.kwh; b.cost += i.cost; b.hours += i.hours * (i.status === "running" ? i.elapsed : 1); });
    $("#ti-by-slot").innerHTML = ["T1", "T2", "T3", "T4", "T5", "FLAT"].filter(function (k) { return by[k]; }).map(function (k) {
      var b = by[k];
      return "<tr><td>" + slotPill({ slot: b.slot }) + "</td><td><strong>" + esc(b.slot.name) + '</strong></td><td class="num">' + b.n +
        '</td><td class="num mono">' + num(b.kwh, 0) + '</td><td class="num mono">₹' + b.slot.rate.toFixed(2) + '</td><td class="num mono">' + rupee(b.cost) +
        '</td><td class="num">' + (cost ? Math.round(b.cost / cost * 100) : 0) + '%</td><td class="num mono">' + (b.hours ? num(b.kwh / b.hours, 1) : "—") + "</td></tr>";
    }).join("");
  }

  function table() {
    var q = (fSearch.value || "").trim().toLowerCase(), sl = fSlot.value, st = fStatus.value;
    shown = all.filter(function (i) {
      return (!sl || i.slotKey === sl) && (!st || i.status === st) &&
        (!q || (i.id + " " + i.slot.name + " " + i.slot.code + " " + i.date).toLowerCase().indexOf(q) > -1);
    });
    $("#ti-rows").innerHTML = shown.length ? shown.map(function (i) {
      var live = i.status !== "upcoming";
      return '<tr><td><button type="button" class="row-link" data-ti="' + i.id + '" style="all:unset;cursor:pointer"><strong>' + i.id + "</strong></button>" +
        (i.early ? '<div class="small muted">after Sunday flat</div>' : "") + "</td>" +
        "<td>" + slotPill(i) + " " + esc(i.slot.name) + "</td>" +
        "<td>" + esc(i.date) + "</td>" +
        '<td class="mono nowrap">' + i.time + (i.crosses ? '<sup class="plus1" title="Ends the next day">+1</sup>' : "") + "</td>" +
        "<td>" + BADGE[i.status] + (i.status === "running" ? '<div class="small muted">' + Math.round(i.elapsed * 100) + "% elapsed</div>" : "") + "</td>" +
        '<td class="num mono">' + (live ? num(i.kwh, 1) : "—") + "</td>" +
        '<td class="num mono">₹' + i.rate.toFixed(2) + "</td>" +
        '<td class="num mono">' + (live ? rupee(i.cost) : "—") + "</td>" +
        '<td class="num mono">' + (live ? num(i.peakKw, 1) : "—") + "</td>" +
        '<td><div class="actions"><button type="button" class="act act--view" data-ti="' + i.id + '" title="View" aria-label="View ' + i.id + '"><i class="ic i-eye"></i></button></div></td></tr>';
    }).join("") : '<tr><td colspan="10" class="muted" style="text-align:center;padding:28px">No tariff instances match these filters.</td></tr>';
  }

  // Detail dialog: summary + split across main meters by their share of today's energy
  function detail(id) {
    var i = all.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    var M = $("#view-ti"), meters = (window.ED_METERS || []).filter(function (m) { return m.energy > 0 && !/solar/i.test(m.name); });
    var tot = meters.reduce(function (a, m) { return a + m.energy; }, 0) || 1;
    $("#vti-sub", M).textContent = i.id + " · " + i.date;
    var rows = meters.map(function (m) { return { m: m, kwh: i.kwh * m.energy / tot }; }).sort(function (a, b) { return b.kwh - a.kwh; });
    $("#vti-body", M).innerHTML =
      '<div class="row wrap" style="gap:10px;margin-bottom:16px">' + slotPill(i) + " <strong>" + esc(i.slot.name) + "</strong> " + BADGE[i.status] + "</div>" +
      '<dl class="kv"><dt>Runs</dt><dd class="mono">' + esc(i.date) + " · " + i.time + (i.crosses ? " (+1 day)" : "") + "</dd>" +
      "<dt>Length</dt><dd>" + num(i.hours, 0) + " h" + (i.status === "running" ? " · " + Math.round(i.elapsed * 100) + "% elapsed" : "") + "</dd>" +
      '<dt>Energy rate</dt><dd class="mono">₹' + i.rate.toFixed(2) + " / kWh</dd>" +
      '<dt>Energy</dt><dd class="mono">' + (i.status === "upcoming" ? "—" : num(i.kwh, 1) + " kWh") + "</dd>" +
      '<dt>Energy cost</dt><dd class="mono">' + (i.status === "upcoming" ? "—" : rupee(i.cost)) + "</dd>" +
      '<dt>Peak demand</dt><dd class="mono">' + (i.status === "upcoming" ? "—" : num(i.peakKw, 1) + " kW") + "</dd>" +
      "<dt>Demand charge</dt><dd>₹" + T.DEMAND + " / kVA on the month's maximum demand</dd></dl>" +
      (i.status === "upcoming" ? "" :
        '<div class="form-section" style="margin-top:18px">By meter</div><div class="table-wrap" style="margin-top:6px"><table class="table"><thead><tr><th>Meter</th><th class="num">Energy kWh</th><th class="num">Cost</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr><td><strong>" + esc(r.m.name) + '</strong> <small class="mono muted">' + esc(r.m.id) + '</small></td><td class="num mono">' + num(r.kwh, 1) + '</td><td class="num mono">' + rupee(r.kwh * i.rate) + "</td></tr>"; }).join("") +
        "</tbody></table></div>");
    location.hash = "#view-ti";
  }

  function exportCsv() {
    var lines = [["Instance", "Slot", "Tariff", "Date", "Start", "End", "Status", "Energy (kWh)", "Rate (Rs/kWh)", "Cost (Rs)", "Peak (kW)"].join(",")];
    shown.forEach(function (i) {
      var live = i.status !== "upcoming", t = i.time.split(" – ");
      lines.push([i.id, i.slot.code, '"' + i.slot.name + '"', '"' + i.date + '"', t[0], t[1], i.status, live ? i.kwh.toFixed(1) : "", i.rate.toFixed(2), live ? i.cost.toFixed(0) : "", live ? i.peakKw.toFixed(1) : ""].join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = "tariff-instances.csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  function render() { load(); stats(); table(); }
  range.addEventListener("change", render);
  [fSlot, fStatus].forEach(function (el) { el.addEventListener("change", table); });
  fSearch.addEventListener("input", table);
  root.addEventListener("click", function (e) { var b = e.target.closest("[data-ti]"); if (b) detail(b.getAttribute("data-ti")); });
  $("#ti-export").addEventListener("click", exportCsv);
  render();
  setInterval(render, 60000); // running instance and its energy move on
})();
