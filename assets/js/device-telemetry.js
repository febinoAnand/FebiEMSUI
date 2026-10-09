/* ==========================================================================
   Energy Dashboard — device telemetry log (device.html)
   Every message received from this device, per meter and polling cycle:
   readings, kWh register, latency and a status — OK, Late, Timeout (the meter
   did not answer), CRC error (corrupt frame, discarded) or Out of range (a value
   outside sane limits, flagged). Filters by meter, status and time range; new
   messages arrive live every polling interval (pause with the Live switch);
   "Raw" shows the payload as the device sent it; Export CSV saves the view.
   Demo mode: messages come from telemetry-core.js (the same history on every
   visit, and the same as Device Management → Telemetry logs). A backend replaces history() with
   GET /devices/:id/telemetry and live updates with the WebSocket 'reading' event.
   ========================================================================== */
(function () {
  var page = document.getElementById("device-page");
  if (!page) return;
  var id = new URLSearchParams(location.search).get("id") || "GW-01";
  var dev = (window.ED_DEVICES || []).filter(function (d) { return d.id === id; })[0];
  if (!dev) return;
  var T = window.EDTelemetry.forDevice(dev), meters = T.meters;
  if (!meters.length) return;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fx(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  var POLL = T.POLL, SOURCE = T.SOURCE, STATUS = EDTelemetry.STATUS, message = T.message, history = T.history;

  /* ---------- markup ---------- */
  var opts = meters.map(function (x) { return '<option value="' + x.slave + '">Slave ' + x.slave + " · " + esc(x.m.name) + "</option>"; }).join("");
  var sec = document.createElement("section");
  sec.className = "card";
  sec.id = "telemetry";
  sec.innerHTML =
    '<div class="card__head"><div><h3 class="card__title"><i class="ic i-activity"></i> Telemetry log</h3>' +
    '<p class="card__sub">Every message received from ' + esc(dev.id) + " · " + esc(SOURCE) + " · every " + esc(dev.polling) + " · newest first</p></div>" +
    '<div class="row wrap" style="gap:8px"><label class="switch" title="Add new messages as they arrive"><input type="checkbox" id="tl-live" checked /> Live</label>' +
    '<button type="button" class="btn btn--sm btn--ghost" id="tl-export"><i class="ic i-download"></i> Export CSV</button></div></div>' +
    '<div class="card__body" style="padding-bottom:0">' +
    '<div class="row wrap" style="gap:10px">' +
    '<select class="input" id="tl-meter" style="width:auto" aria-label="Meter"><option value="">All meters</option>' + opts + "</select>" +
    '<select class="input" id="tl-status" style="width:auto" aria-label="Status"><option value="">Any status</option><option value="problem">Problems only</option><option value="ok">OK</option><option value="late">Late</option><option value="timeout">Timeout</option><option value="crc">CRC error</option><option value="range">Out of range</option></select>' +
    '<select class="input" id="tl-span" style="width:auto" aria-label="Time range"><option value="900000">Last 15 min</option><option value="3600000" selected>Last 1 hour</option><option value="21600000">Last 6 hours</option></select>' +
    '<div class="row wrap" id="tl-chips" style="gap:8px;margin-left:auto"></div></div></div>' +
    '<div class="table-wrap"><table class="table"><thead id="tl-head"></thead>' +
    '<tbody id="tl-rows"></tbody></table></div>';
  // under "Connected meters"
  var anchor = Array.prototype.filter.call(page.querySelectorAll("section.card"), function (s) { return /Connected meters/.test(s.textContent); })[0];
  if (anchor) anchor.insertAdjacentElement("afterend", sec); else page.appendChild(sec);

  /* ---------- telemetry chart (above the log): one measure at a time, a line per meter ---------- */
  var chartSec = document.createElement("section");
  chartSec.className = "card tchart";
  chartSec.id = "telemetry-chart";
  chartSec.innerHTML =
    '<div class="card__head"><div><h3 class="card__title"><i class="ic i-chart"></i> Telemetry chart</h3><p class="card__sub" id="tc-sub"></p></div>' +
    '<div class="seg" id="tc-measure" role="group" aria-label="Measure"></div></div>' +
    '<div class="card__body"><div class="tchart__legend" id="tc-legend"></div><div class="chart-box tchart__box" id="tc-box"></div>' +
    '<div class="tchart__legend tchart__legend--status"><span class="tchart__st"><i style="background:var(--st-late)"></i>Late</span>' +
    '<span class="tchart__st"><i style="background:var(--st-range)"></i>Out of range</span><span class="tchart__st"><i style="background:var(--st-lost)"></i>Lost (timeout / CRC)</span>' +
    '<span class="tchart__st"><i style="background:var(--st-ok)"></i>OK</span><span class="small muted">· gaps in a line are lost or flagged messages · the log below is the table view</span></div></div>';
  sec.parentNode.insertBefore(chartSec, sec);

  var fMeter = $("#tl-meter"), fStatus = $("#tl-status"), fSpan = $("#tl-span"), live = $("#tl-live"), tbody = $("#tl-rows");
  var all = [], view = [], fresh = {};

  function cells(r) {
    var x = r.x, s = STATUS[r.status], d = new Date(r.t), bad = r.status === "timeout" || r.status === "crc";
    var time = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    var key = r.t + "-" + x.slave;
    return '<tr' + (fresh[key] ? ' class="is-new"' : "") + '><td class="mono nowrap">' + time + '<div class="small muted" style="font-family:var(--font)">' + d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + "</div></td>" +
      '<td><strong>' + esc(x.m.name) + '</strong><div class="small muted">Slave ' + x.slave + " · " + esc(x.m.id) + " · " + (x.m.phase === 1 ? "1φ" : "3φ") + " · " + esc(x.cls.label) + "</div></td>" +
      F.map(function (f) { return EDTelemetry.cell(r, f); }).join("") +
      '<td class="num mono">' + (r.status === "timeout" ? "> 1,000 ms" : fx(r.latency, 0) + " ms") + "</td>" +
      '<td><span class="badge badge--' + s[0] + '"><span class="dot"></span> ' + s[1] + "</span></td>" +
      '<td><button type="button" class="btn btn--sm btn--ghost" data-raw="' + key + '"><i class="ic i-file"></i> Raw</button></td></tr>';
  }

  function chips() {
    var n = view.length, ok = view.filter(function (r) { return r.status === "ok"; }).length;
    var errs = view.filter(function (r) { return r.status === "timeout" || r.status === "crc"; }).length;
    var lat = view.filter(function (r) { return r.status !== "timeout"; });
    var avg = lat.length ? lat.reduce(function (a, r) { return a + r.latency; }, 0) / lat.length : 0;
    $("#tl-chips").innerHTML =
      '<span class="tag">' + fx(n, 0) + " messages</span>" +
      '<span class="tag" style="color:var(--green)">' + (n ? fx(ok / n * 100, 1) : "0") + "% OK</span>" +
      '<span class="tag"' + (errs ? ' style="color:var(--rose)"' : "") + ">" + errs + " lost</span>" +
      '<span class="tag">avg ' + fx(avg, 0) + " ms</span>";
  }

  // fields of the meters in view (their classes decide which columns and chart tabs exist)
  var F = [];
  function scope() { return meters.filter(function (x) { return !fMeter.value || String(x.slave) === fMeter.value; }); }
  function head() {
    F = EDTelemetry.fieldsFor(scope());
    $("#tl-head").innerHTML = "<tr><th>Time</th><th>Meter</th>" + F.map(function (f) { return '<th class="num">' + esc(f.col) + "</th>"; }).join("") + '<th class="num">Latency</th><th>Status</th><th></th></tr>';
    tabs();
  }
  function render() {
    head();
    var sl = fMeter.value, st = fStatus.value;
    view = all.filter(function (r) {
      return (!sl || String(r.x.slave) === sl) && (!st || (st === "problem" ? r.status !== "ok" : r.status === st));
    });
    tbody.innerHTML = view.length ? view.map(cells).join("") : '<tr><td colspan="' + (F.length + 5) + '" class="muted" style="text-align:center;padding:28px">No messages match these filters.</td></tr>';
    chips();
    drawChart();
  }

  function load() { all = history(+fSpan.value, Date.now()); fresh = {}; render(); }

  // Live: one new polling cycle at a time
  var lastCycle = Math.floor(Date.now() / POLL) * POLL;
  setInterval(function () {
    var cyc = Math.floor(Date.now() / POLL) * POLL;
    if (!live.checked || cyc <= lastCycle) return;
    fresh = {};
    for (var t = lastCycle + POLL; t <= cyc; t += POLL) {
      meters.slice().reverse().forEach(function (x) { var r = message(x, t); all.unshift(r); fresh[t + "-" + x.slave] = 1; });
    }
    lastCycle = cyc;
    var cutoff = Date.now() - +fSpan.value;
    all = all.filter(function (r) { return r.t > cutoff; });
    render();
  }, Math.min(POLL, 5000));

  /* ---------- raw payload dialog ---------- */
  function raw(key) {
    var r = all.filter(function (x) { return x.t + "-" + x.x.slave === key; })[0];
    if (!r) return;
    var envelope = T.envelope(r);
    var M = $("#telemetry-raw");
    $("#telemetry-raw-t", M).textContent = "Raw message";
    $("#tr-sub", M).textContent = r.x.m.name + " · slave " + r.x.slave + " · " + new Date(r.t).toLocaleString();
    $("#tr-meta", M).innerHTML = '<span class="badge badge--' + STATUS[r.status][0] + '"><span class="dot"></span> ' + STATUS[r.status][1] + '</span> <span class="tag">' + esc(SOURCE) + '</span> <span class="tag">received ' + (r.status === "timeout" ? "—" : "after " + fx(r.latency, 0) + " ms") + "</span>" +
      (r.status === "range" ? '<p class="hint" style="margin-top:8px;color:var(--rose)">Voltage is above 1.25 × nominal — the value is stored but flagged and left out of alerts.</p>' : "") +
      (r.status === "late" ? '<p class="hint" style="margin-top:8px">Arrived more than 5 s after it was read — stored with its original time.</p>' : "");
    $("#tr-json", M).textContent = JSON.stringify(envelope, null, 2);
    location.hash = "#telemetry-raw";
  }

  function exportCsv() {
    // columns = fields of the meters in view; blank where a meter class has no such field or the message was lost
    var lines = [["Time", "Meter ID", "Meter", "Meter class", "Slave", "Phase"].concat(F.map(function (f) { return f.label + (f.unit ? " (" + f.unit + ")" : ""); }), ["Latency (ms)", "Status"]).join(",")];
    view.forEach(function (r) {
      var bad = r.status === "timeout" || r.status === "crc";
      lines.push([new Date(r.t).toISOString(), r.x.m.id, '"' + r.x.m.name.replace(/"/g, '""') + '"', '"' + r.x.cls.label + '"', r.x.slave, r.x.m.phase === 1 ? "1" : "3"]
        .concat(F.map(function (f) { return bad || r[f.k] == null ? "" : r[f.k].toFixed(Math.max(f.d, f.k === "kw" ? 2 : f.d)); }), [r.status === "timeout" ? "" : r.latency, STATUS[r.status][1]]).join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = dev.id + "-telemetry.csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  var LAT = { k: "lat", label: "Latency", unit: "ms", d: 0, zero: true };
  function MEASURE(k) { return k === "lat" ? LAT : EDTelemetry.FIELDS.filter(function (f) { return f.k === k; })[0]; }
  function valueOf(r, k) { return k === "lat" ? r.latency : r[k]; }
  // chart tabs: the chartable fields of the meters in view, plus latency
  function tabs() {
    var list = F.filter(function (f) { return f.chart !== false; }).concat([LAT]);
    if (!list.some(function (f) { return f.k === measure; })) measure = list[0].k;
    var bar = $("#tc-measure"), html = list.map(function (f) { return '<button type="button" data-m="' + f.k + '"' + (f.k === measure ? ' class="is-on" aria-pressed="true"' : ' aria-pressed="false"') + ">" + esc(f.label) + "</button>"; }).join("");
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }
  var measure = "kw";
  var SEV = { ok: 0, late: 1, range: 2, crc: 3, timeout: 3 };
  var SEVVAR = ["--st-ok", "--st-late", "--st-range", "--st-lost"];
  var SEVNAME = ["OK", "Late", "Out of range", "Lost"];
  function niceTicks(lo, hi, n) {
    var span = hi - lo || Math.abs(hi) || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
    var a = Math.floor(lo / step) * step, out = [];
    for (var v = a; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function drawChart() {
    var box = $("#tc-box"), M = MEASURE(measure);
    var span = +fSpan.value, end = Math.floor(Date.now() / POLL) * POLL, start = end - span + POLL;
    // only meters whose class reports this measure get a line
    var shown = scope().filter(function (x) { return measure === "lat" || x.cls.fields.indexOf(measure) >= 0; });
    // per meter: points ascending in time; value null when the message was lost
    var series = shown.map(function (x) {
      var pts = all.filter(function (r) { return r.x === x; }).sort(function (p, q) { return p.t - q.t; }).map(function (r) {
        var lost = r.status === "timeout" || r.status === "crc" || r.status === "range"; // flagged values stay off the line (see status strip)
        return { t: r.t, r: r, y: measure === "lat" ? (r.status === "timeout" ? null : r.latency) : lost ? null : valueOf(r, measure) };
      });
      return { x: x, slot: meters.indexOf(x), pts: pts };
    });
    $("#tc-sub").textContent = M.label + (M.unit ? " (" + M.unit + ")" : "") + " by meter · " + fSpan.options[fSpan.selectedIndex].text.toLowerCase() + " · every " + dev.polling;
    $("#tc-legend").innerHTML = series.length > 1 ? series.map(function (sr) {
      return '<span class="tchart__key"><i style="background:var(--series-' + (sr.slot + 1) + ')"></i>' + esc(sr.x.m.name) + "</span>";
    }).join("") : "";

    var W = Math.max(320, box.clientWidth), LAB = W < 560 ? 12 : 128, padL = 52, padR = LAB, padT = 26, ph = 220;
    var rowH = 9, rowGap = 5, stripTop = padT + ph + 46, Hh = stripTop + series.length * (rowH + rowGap) + 6, iw = W - padL - padR;
    var vals = [];
    series.forEach(function (sr) { sr.pts.forEach(function (p) { if (p.y != null) vals.push(p.y); }); });
    if (!vals.length) { box.innerHTML = '<p class="muted center" style="padding:60px 0">No readings in this range — every message was lost.</p>'; return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (M.zero) lo = Math.min(0, lo);
    if (hi - lo < 1e-9) { hi += 1; lo -= M.zero ? 0 : 1; }
    var ticks = niceTicks(lo, hi + (hi - lo) * 0.06, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    var X = function (t) { return padL + iw * (t - start) / Math.max(1, end - start); };
    var Y = function (v) { return padT + ph - ph * (v - lo) / (hi - lo); };
    var g = "";
    ticks.forEach(function (v) {
      g += '<line class="grid-line" x1="' + padL + '" x2="' + (padL + iw) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>' +
        '<text class="axis-text" x="' + (padL - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fx(v, M.d && (hi - lo) < 5 ? M.d : 0) + "</text>";
    });
    if (M.unit) g += '<text class="axis-text" x="' + (padL - 8) + '" y="' + (padT - 14) + '" text-anchor="end">' + M.unit + "</text>";
    for (var k = 0; k <= 4; k++) { var tt = start + (end - start) * k / 4; g += '<text class="axis-text" x="' + X(tt).toFixed(1) + '" y="' + (padT + ph + 18) + '" text-anchor="' + (k === 0 ? "start" : k === 4 ? "end" : "middle") + '">' + (k === 4 ? "now" : hm(tt)) + "</text>"; }
    // lines (gaps where lost)
    series.forEach(function (sr) {
      var d = "", pen = false;
      sr.pts.forEach(function (p) { if (p.y == null) { pen = false; return; } d += (pen ? "L" : "M") + X(p.t).toFixed(1) + "," + Y(p.y).toFixed(1); pen = true; });
      g += '<path class="tchart__line" style="stroke:var(--series-' + (sr.slot + 1) + ')" d="' + d + '"/>';
    });
    // end labels (direct labels, nudged apart)
    if (LAB > 20) {
      var labs = series.map(function (sr) {
        for (var i = sr.pts.length - 1; i >= 0; i--) if (sr.pts[i].y != null) return { sr: sr, p: sr.pts[i], y: Y(sr.pts[i].y) };
        return null;
      }).filter(Boolean).sort(function (a, b) { return a.y - b.y; });
      for (var j = 1; j < labs.length; j++) if (labs[j].y - labs[j - 1].y < 26) labs[j].y = labs[j - 1].y + 26;
      labs.forEach(function (l) {
        var lx = padL + iw + 10, nm = l.sr.x.m.name.length > 15 ? l.sr.x.m.name.slice(0, 14) + "…" : l.sr.x.m.name;
        g += '<circle cx="' + X(l.p.t).toFixed(1) + '" cy="' + Y(l.p.y).toFixed(1) + '" r="4" class="tchart__end" style="fill:var(--series-' + (l.sr.slot + 1) + ')"/>' +
          '<line x1="' + lx + '" x2="' + (lx + 10) + '" y1="' + l.y.toFixed(1) + '" y2="' + l.y.toFixed(1) + '" style="stroke:var(--series-' + (l.sr.slot + 1) + ');stroke-width:2;stroke-linecap:round"/>' +
          '<text class="tchart__lab" x="' + (lx + 14) + '" y="' + (l.y - 1).toFixed(1) + '">' + esc(nm) + '</text><text class="tchart__val" x="' + (lx + 14) + '" y="' + (l.y + 11).toFixed(1) + '">' + fx(l.p.y, M.d) + (M.unit ? " " + M.unit : "") + "</text>";
      });
    }
    // status strip: one row per meter, worst status per cell
    var cycles = Math.round((end - start) / POLL) + 1, cells = Math.max(1, Math.min(cycles, Math.floor(iw / 5))), cw = iw / cells;
    g += '<text class="axis-text" x="' + padL + '" y="' + (stripTop - 6) + '">Message status</text>';
    series.forEach(function (sr, ri) {
      var y = stripTop + ri * (rowH + rowGap), worst = [];
      sr.pts.forEach(function (p) { var c = Math.min(cells - 1, Math.max(0, Math.floor((p.t - start) / (end - start + POLL) * cells))); worst[c] = Math.max(worst[c] || 0, SEV[p.r.status]); });
      g += '<text class="axis-text" x="' + (padL - 8) + '" y="' + (y + rowH - 1) + '" text-anchor="end">S' + sr.x.slave + "</text>";
      for (var c = 0; c < cells; c++) if (worst[c] != null) g += '<rect x="' + (padL + c * cw).toFixed(1) + '" y="' + y + '" width="' + Math.max(1, cw - 1.5).toFixed(1) + '" height="' + rowH + '" rx="1.5" style="fill:var(' + SEVVAR[worst[c]] + ')"/>';
    });
    g += '<line class="cross" y1="' + padT + '" y2="' + (Hh - 6) + '" visibility="hidden"/><g class="tchart__dots"></g>' +
      '<rect class="tchart__hit" x="' + padL + '" y="0" width="' + iw + '" height="' + Hh + '" fill="transparent"/>';
    var lost = series.reduce(function (n, sr) { return n + sr.pts.filter(function (p) { return p.r.status === "timeout" || p.r.status === "crc"; }).length; }, 0);
    box.innerHTML = '<svg width="' + W + '" height="' + Hh + '" role="img" aria-label="' + esc(M.label + " by meter for " + dev.name + ", " + fSpan.options[fSpan.selectedIndex].text.toLowerCase() + "; " + lost + " messages lost. Values are listed in the telemetry log below.") + '">' + g + "</svg>";

    // hover: crosshair + tooltip with every meter at the nearest polling cycle
    var svg = box.querySelector("svg"), cross = svg.querySelector(".cross"), dots = svg.querySelector(".tchart__dots");
    var tip = document.createElement("div"); tip.className = "chart-tip"; tip.hidden = true; box.appendChild(tip);
    var hit = svg.querySelector(".tchart__hit");
    hit.addEventListener("mousemove", function (e) {
      var rr = svg.getBoundingClientRect(), t = start + (e.clientX - rr.left - padL) / iw * (end - start);
      t = Math.max(start, Math.min(end, Math.round(t / POLL) * POLL));
      var cx = X(t), lines = [], dd = "";
      series.forEach(function (sr) {
        var p = sr.pts.filter(function (q) { return q.t === t; })[0];
        if (!p) return;
        var st = SEVNAME[SEV[p.r.status]];
        if (p.y != null) dd += '<circle cx="' + cx.toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="4.5" class="tchart__end" style="fill:var(--series-' + (sr.slot + 1) + ')"/>';
        lines.push('<span class="tchart__tipkey"><i style="background:var(--series-' + (sr.slot + 1) + ')"></i>' + esc(sr.x.m.name) + "</span> <b>" + (p.y == null ? "—" : fx(p.y, M.d) + (M.unit ? " " + M.unit : "")) + "</b>" + (st !== "OK" ? " · " + st : ""));
      });
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      dots.innerHTML = dd;
      var d = new Date(t);
      tip.innerHTML = '<div style="opacity:.75;margin-bottom:3px">' + hm(t) + ":" + pad(d.getSeconds()) + "</div>" + lines.join("<br>");
      tip.style.left = Math.min(cx, W - 160) + "px"; tip.style.top = padT + "px"; tip.hidden = false;
    });
    hit.addEventListener("mouseleave", function () { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.innerHTML = ""; });
  }
  $("#tc-measure").addEventListener("click", function (e) {
    var b = e.target.closest("[data-m]"); if (!b) return;
    measure = b.getAttribute("data-m");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    drawChart();
  });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(drawChart, 150); });

  [fMeter, fStatus].forEach(function (el) { el.addEventListener("change", render); });
  fSpan.addEventListener("change", load);
  $("#tl-export").addEventListener("click", exportCsv);
  sec.addEventListener("click", function (e) { var b = e.target.closest("[data-raw]"); if (b) raw(b.getAttribute("data-raw")); });
  load();
})();
