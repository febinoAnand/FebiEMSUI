/* ==========================================================================
   Energy Dashboard — Export (CSV / PDF) with a From–To date range
   Any <a data-export="scope"> opens the Export dialog: pick the dates and a format,
   then the report is built for exactly that period and downloaded.
     energy     all meters, one row per meter per day        (Dashboard, Analytics)
     meters     meters + sub-meters, per day                   (Energy Meters)
     submeters  sub-meters only, per day                       (Analytics → sub-meter report)
     meter      one meter (data-export-id) + its sub-meters    (meter page)
     devices    each device's data availability, per day      (Device Management)
     users      the organisation's users                        (Users)
     shifts     every shift run, per day                       (Shift Instances)
   Readings are demo data, generated deterministically (same meter + day → same numbers).
   PDF uses jsPDF from cdnjs; if it can't load (offline), the browser's print dialog
   opens instead so the report can still be saved as PDF.
   ========================================================================== */
(function () {
  var S = window.EDStore;
  if (!S || !document.querySelector("[data-export]")) return;
  var sess = S.session();
  if (sess.status !== "ok") return;
  var ORG = sess.tenant;
  var TARIFF = 8, CO2 = 0.82, DAY = 864e5, MAX_DAYS = 366;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return ("0" + n).slice(-2); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(v) { var p = String(v || "").split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function nice(d) { return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  function round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function days(from, to) { var out = []; for (var d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(d); return out; }
  function rng(seed) { // mulberry32 on a string: the same meter + day always gives the same reading
    var t = 0; for (var i = 0; i < seed.length; i++) t = (t * 31 + seed.charCodeAt(i)) | 0;
    return function () { t = (t + 0x6D2B79F5) | 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- report builders: (from, to, opts) → { title, columns, rows, note } ---------- */
  var METERS = function () { return window.ED_METERS || []; };
  function dailyKwh(m, d) {
    var avg = Math.abs(m.energy || 0) / Math.max(1, today().getDate()); // month-to-date average per day
    var R = rng(m.id + iso(d)), dow = d.getDay();
    var solar = /solar/i.test(m.name), dg = /dg set/i.test(m.name);
    var f = solar ? 0.55 + 0.6 * R() : dg ? (R() < 0.12 ? 1.5 : 0.05) : (dow === 0 ? 0.55 : dow === 6 ? 0.8 : 1) * (0.88 + 0.24 * R());
    return avg * f;
  }
  function energyRows(list, from, to) {
    var rows = [];
    days(from, to).forEach(function (d) {
      list.forEach(function (x) {
        var kwh = dailyKwh(x.m, d), R = rng(x.m.id + iso(d) + "pk");
        rows.push([iso(d), x.m.id, x.m.name, x.parent || "—", x.m.location || x.where || "—", x.m.phase === 1 ? "1φ" : "3φ", round(kwh, 1), round(kwh / 24 * (1.6 + 0.6 * R()), 1), round(kwh * TARIFF, 0), round(kwh * CO2, 1)]);
      });
    });
    return rows;
  }
  var ENERGY_COLS = ["Date", "Meter ID", "Meter", "Parent meter", "Location", "Phase", "Energy (kWh)", "Peak (kW)", "Cost (₹)", "CO₂ (kg)"];
  function meterList(withSubs, onlySubs, only) {
    var out = [];
    METERS().forEach(function (m) {
      if (only && m.id !== only && !(m.subs || []).some(function (s) { return s.id === only; })) return;
      if (!onlySubs && (!only || m.id === only)) out.push({ m: m });
      if (withSubs || onlySubs) (m.subs || []).forEach(function (s) { if (!only || only === m.id || only === s.id) out.push({ m: s, parent: m.id, where: m.location }); });
    });
    return out;
  }
  var BUILD = {
    energy: function (from, to) {
      return { title: "Energy report · all meters", columns: ENERGY_COLS, rows: energyRows(meterList(false), from, to), note: "One row per meter per day. Cost at ₹" + TARIFF.toFixed(2) + "/kWh; CO₂ at " + CO2 + " kg/kWh." };
    },
    meters: function (from, to) {
      return { title: "Energy meters and sub-meters", columns: ENERGY_COLS, rows: energyRows(meterList(true), from, to), note: "One row per meter and sub-meter per day." };
    },
    submeters: function (from, to) {
      return { title: "Sub-meter consumption report", columns: ENERGY_COLS, rows: energyRows(meterList(false, true), from, to), note: "One row per sub-meter per day. Cost allocated at ₹" + TARIFF.toFixed(2) + "/kWh." };
    },
    meter: function (from, to, o) {
      var list = meterList(true, false, o.id), main = list[0] ? list[0].m : { name: o.id };
      return { title: "Meter report · " + main.name + " (" + o.id + ")", columns: ENERGY_COLS, rows: energyRows(list, from, to), note: list.length > 1 ? "This meter and its " + (list.length - 1) + " sub-meters, one row per day." : "One row per day." };
    },
    devices: function (from, to) {
      var rows = [];
      days(from, to).forEach(function (d) {
        (window.ED_DEVICES || []).forEach(function (dev) {
          var R = rng(dev.id + iso(d)), avail = dev.status === "weak" ? 88 + 9 * R() : 98 + 2 * R();
          var perDay = Math.round(86400 / (parseInt(dev.polling, 10) * (/min/.test(dev.polling) ? 60 : 1) || 15));
          rows.push([iso(d), dev.id, dev.name, dev.type, dev.site, (dev.meters || []).length, dev.polling, perDay, Math.round(perDay * avail / 100), round(avail, 1)]);
        });
      });
      return { title: "Device data availability", columns: ["Date", "Device ID", "Device", "Type", "Site", "Meters", "Polling", "Readings expected", "Readings received", "Availability (%)"], rows: rows, note: "One row per device per day." };
    },
    users: function (from, to) {
      var end = to.getTime() + DAY;
      var rows = S.users(ORG.id).filter(function (u) { return !u.created || u.created < end; }).map(function (u) {
        var active = u.lastActive && u.lastActive >= from.getTime() && u.lastActive < end;
        return [S.fullName(u), u.username, u.email, u.empId || "", u.role, u.dept || "", u.shift || "", u.status,
          u.created ? iso(new Date(u.created)) : "", u.lastActive ? iso(new Date(u.lastActive)) : "Never", active ? "Yes" : "No"];
      });
      return { title: "Users", columns: ["Name", "Username", "Email", "Employee ID", "Role", "Department", "Shift", "Status", "Created", "Last active", "Active in period"], rows: rows, note: "Everyone with an account by the end of the period." };
    },
    shifts: function (from, to) {
      var SH = [["A", "Shift A · Morning", "06:00", "14:00", 14, 0.84], ["B", "Shift B · Evening", "14:00", "22:00", 12, 0.91], ["C", "Shift C · Night", "22:00", "06:00", 8, 1.12], ["G", "General", "09:30", "18:30", 11, 0]];
      var rows = [], now = new Date();
      days(from, to).forEach(function (d) {
        var dow = d.getDay();
        SH.forEach(function (s) {
          if (s[0] === "G" && (dow === 0 || dow === 6)) return;
          if (s[0] === "C" && (dow === 0 || dow === 6)) return; // night shift starts Mon–Fri
          if (s[0] !== "C" && dow === 0) return;
          var R = rng(s[0] + iso(d)), start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +s[2].slice(0, 2), +s[2].slice(3));
          var state = start > now ? "Upcoming" : start.getTime() + 8 * 36e5 > now.getTime() ? "Running" : R() < 0.03 ? "Missed" : "Completed";
          var present = state === "Missed" ? 0 : state === "Upcoming" ? "" : Math.max(1, s[4] - (R() < 0.3 ? 1 : 0));
          var kwh = state === "Completed" ? Math.round((s[0] === "G" ? 100 : 300) * (0.85 + 0.3 * R())) : "";
          var cross = s[3] < s[2], end = cross ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) : d;
          var before = cross ? (1440 - (+s[2].slice(0, 2) * 60 + +s[2].slice(3))) : 0, after = cross ? +s[3].slice(0, 2) * 60 + +s[3].slice(3) : 0;
          var k0 = cross && kwh !== "" ? Math.round(kwh * before / (before + after)) : "", k1 = cross && kwh !== "" ? kwh - k0 : "";
          rows.push(["SI-" + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + s[0], iso(d), s[1], s[2] + "–" + s[3] + (cross ? " (+1 day)" : ""), cross ? "Yes" : "No", iso(end) + " " + s[3],
            present === "" ? "" : present + " / " + s[4], kwh, k0, k1, s[5] && kwh ? s[5] : "", state]);
        });
      });
      return { title: "Shift instances", columns: ["Instance", "Date (counted on)", "Shift", "Planned", "Midnight crossover", "Ends", "Staff present", "Energy (kWh)", "kWh before midnight", "kWh after midnight", "kWh / unit", "Status"], rows: rows, note: "Every run of every shift in the period. Midnight-crossover shifts are counted on the day they start; their energy is split by the hours before and after midnight." };
    },
  };

  /* ---------- dialog ---------- */
  var box = document.createElement("div");
  box.innerHTML =
    '<div class="modal" id="export" role="dialog" aria-modal="true" aria-labelledby="ex-title"><a href="#close" class="modal__backdrop" aria-label="Close"></a>' +
    '<div class="modal__dialog"><div class="modal__head"><span class="modal__icon"><i class="ic i-download"></i></span>' +
    '<div><h3 id="ex-title">Export</h3><p id="ex-name">Report</p></div><a href="#close" class="modal__close" aria-label="Close"><i class="ic i-x"></i></a></div>' +
    '<div class="modal__body"><div class="ex-quick" role="group" aria-label="Quick ranges">' +
    [["today", "Today"], ["yesterday", "Yesterday"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["month", "This month"], ["lastmonth", "Last month"]].map(function (q) {
      return '<button type="button" class="chip" data-range="' + q[0] + '">' + q[1] + "</button>";
    }).join("") + "</div>" +
    '<div class="form-grid" style="margin-top:14px"><div class="field"><label for="ex-from">From <span class="req">*</span></label><input type="date" id="ex-from" class="input" required /></div>' +
    '<div class="field"><label for="ex-to">To <span class="req">*</span></label><input type="date" id="ex-to" class="input" required /></div></div>' +
    '<div class="field" style="margin-top:14px"><label>Format</label><div class="picks">' +
    '<label class="pick"><input type="radio" name="ex-format" value="csv" checked /><span><i class="ic i-file"></i> CSV · Excel</span></label>' +
    '<label class="pick"><input type="radio" name="ex-format" value="pdf" /><span><i class="ic i-file"></i> PDF</span></label></div></div>' +
    '<p class="small muted" id="ex-summary" style="margin-top:12px"></p>' +
    '<div class="callout callout--danger" id="ex-error" hidden style="margin-top:12px"><i class="ic i-alert"></i><span></span></div></div>' +
    '<div class="modal__foot"><a href="#close" class="btn btn--ghost">Cancel</a><button type="button" class="btn btn--primary" id="ex-go"><i class="ic i-download"></i> Download</button></div></div></div>' +
    '<div class="toast" id="ex-toast" role="status"><span class="toast__icon"><i class="ic i-check"></i></span><div><strong>Export ready</strong><span id="ex-toast-text"></span></div></div>';
  while (box.firstChild) document.body.appendChild(box.firstChild);
  var M = $("#export"), from = $("#ex-from"), to = $("#ex-to");
  var job = null; // { scope, id }

  function setRange(key) {
    var t = today(), f = t, e = t;
    if (key === "yesterday") { f = e = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1); }
    else if (key === "7" || key === "30") f = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (+key - 1));
    else if (key === "month") f = new Date(t.getFullYear(), t.getMonth(), 1);
    else if (key === "lastmonth") { f = new Date(t.getFullYear(), t.getMonth() - 1, 1); e = new Date(t.getFullYear(), t.getMonth(), 0); }
    from.value = iso(f); to.value = iso(e);
    update();
  }
  function problem() {
    var f = parse(from.value), t = parse(to.value);
    if (!f || !t) return "Choose both a From and a To date.";
    if (f > t) return "From must be on or before To.";
    if (t > today()) return "To can't be in the future.";
    if ((t - f) / DAY + 1 > MAX_DAYS) return "Choose a period of at most " + MAX_DAYS + " days.";
    return "";
  }
  function update() {
    var p = problem(), err = $("#ex-error");
    $$(".ex-quick .chip", M).forEach(function (c) { c.classList.remove("is-active"); });
    err.hidden = !p || (!from.value && !to.value);
    $("span", err).textContent = p;
    if (p) { $("#ex-summary").textContent = ""; return; }
    var f = parse(from.value), t = parse(to.value), n = Math.round((t - f) / DAY) + 1;
    var rep = BUILD[job.scope](f, t, job);
    $("#ex-summary").textContent = nice(f) + " – " + nice(t) + " · " + n + " day" + (n === 1 ? "" : "s") + " · " + rep.rows.length.toLocaleString("en-IN") + " row" + (rep.rows.length === 1 ? "" : "s");
  }
  function open(scope, id) {
    job = { scope: BUILD[scope] ? scope : "energy", id: id || null };
    $("#ex-name").textContent = BUILD[job.scope](today(), today(), job).title;
    if (!from.value || !to.value) setRange("month"); else update();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-export]");
    if (b) open(b.getAttribute("data-export"), b.getAttribute("data-export-id"));
  }, true);
  // Opened by a link / reload (…#export) rather than a button: use the page's first export
  function openFromHash() { if (location.hash === "#export" && !job) { var b = $("[data-export]"); if (b) open(b.getAttribute("data-export"), b.getAttribute("data-export-id")); } }
  window.addEventListener("hashchange", openFromHash);
  M.addEventListener("click", function (e) {
    var q = e.target.closest("[data-range]");
    if (q) { setRange(q.getAttribute("data-range")); q.classList.add("is-active"); }
    if (e.target.closest("#ex-go")) go();
  });
  from.addEventListener("change", update); to.addEventListener("change", update);
  from.max = to.max = iso(today());
  setTimeout(openFromHash, 0); // meter.html builds its Export button a moment later

  /* ---------- output ---------- */
  function fileName(rep, f, t, ext) {
    return (ORG.id + "-" + rep.title.split("·")[0].trim() + "-" + iso(f) + "-to-" + iso(t)).replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").toLowerCase() + "." + ext;
  }
  function header(rep, f, t) {
    return [["Organisation", ORG.name + " (" + ORG.id + ")"], ["Report", rep.title], ["Period", nice(f) + " – " + nice(t)], ["Generated", new Date().toLocaleString()], ["Notes", rep.note]];
  }
  function csvCell(v) { var s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function toCsv(rep, f, t) {
    var lines = header(rep, f, t).map(function (h) { return h.map(csvCell).join(","); });
    lines.push("", rep.columns.map(csvCell).join(","));
    rep.rows.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName(rep, f, t, "csv"));
  }
  // jsPDF (and its table plugin) are loaded only when someone asks for a PDF
  var pdfLib = null;
  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); }
  function jsPDF() {
    var has = function () { return window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable; };
    if (!pdfLib) pdfLib = (has() ? Promise.resolve() : loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      .then(function () { return loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"); }))
      .then(function () { if (!has()) throw new Error("jsPDF missing"); return window.jspdf.jsPDF; });
    return pdfLib;
  }
  var ascii = function (v) { return String(v == null ? "" : v).replace(/₹/g, "Rs ").replace(/₂/g, "2").replace(/φ/g, "-ph").replace(/[–—]/g, "-").replace(/[·•]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E]/g, ""); };
  function toPdf(rep, f, t) {
    return jsPDF().then(function (PDF) {
      var doc = new PDF({ orientation: rep.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
      doc.setFontSize(15); doc.text(ascii(rep.title), 40, 44);
      doc.setFontSize(9); doc.setTextColor(90);
      header(rep, f, t).filter(function (h) { return h[0] !== "Report"; }).forEach(function (h, i) { doc.text(ascii(h[0] + ": " + h[1]), 40, 62 + i * 12); });
      doc.autoTable({ head: [rep.columns.map(ascii)], body: rep.rows.map(function (r) { return r.map(ascii); }), startY: 62 + 4 * 12 + 10,
        styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [99, 91, 255] }, alternateRowStyles: { fillColor: [246, 246, 251] }, margin: { left: 40, right: 40 } });
      doc.save(fileName(rep, f, t, "pdf"));
    }).catch(function () { printable(rep, f, t); });
  }
  // Fallback when jsPDF can't be loaded: a clean printable page ("Save as PDF" in the print dialog)
  function printable(rep, f, t) {
    var w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups for this site to save the PDF."); return; }
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>" + esc(rep.title) + "</title><style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 8px}dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;color:#555;margin:0 0 14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#635bff;color:#fff}tr:nth-child(even) td{background:#f6f6fb}@page{size:landscape;margin:12mm}</style></head><body>" +
      "<h1>" + esc(rep.title) + "</h1><dl>" + header(rep, f, t).filter(function (h) { return h[0] !== "Report"; }).map(function (h) { return "<dt>" + esc(h[0]) + "</dt><dd>" + esc(h[1]) + "</dd>"; }).join("") + "</dl>" +
      "<table><thead><tr>" + rep.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rep.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></body></html>");
    w.document.close(); w.focus(); w.print();
  }
  var toastTimer;
  function toast(text) {
    var el = $("#ex-toast");
    $("#ex-toast-text").textContent = text;
    el.classList.remove("is-shown"); void el.offsetWidth; el.classList.add("is-shown");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("is-shown"); }, 4000);
  }
  function go() {
    var p = problem();
    if (p) { var err = $("#ex-error"); err.hidden = false; $("span", err).textContent = p; return; }
    var f = parse(from.value), t = parse(to.value), rep = BUILD[job.scope](f, t, job);
    var fmt = ($('input[name="ex-format"]:checked', M) || {}).value || "csv", btn = $("#ex-go");
    if (!rep.rows.length) { var e2 = $("#ex-error"); e2.hidden = false; $("span", e2).textContent = "There's nothing to export for this period."; return; }
    if (fmt === "csv") { toCsv(rep, f, t); location.hash = "close"; toast(rep.rows.length.toLocaleString("en-IN") + " rows · CSV downloaded"); job = null; return; }
    btn.disabled = true; btn.innerHTML = '<i class="ic i-refresh"></i> Preparing PDF…';
    toPdf(rep, f, t).then(function () {
      btn.disabled = false; btn.innerHTML = '<i class="ic i-download"></i> Download';
      location.hash = "close"; toast(rep.rows.length.toLocaleString("en-IN") + " rows · PDF ready"); job = null;
    });
  }
  window.EDExport = { build: function (scope, f, t, id) { return BUILD[scope](parse(f), parse(t), { id: id }); } }; // for checks
})();
