/* ==========================================================================
   Energy Dashboard — device telemetry log (device.html)
   Every message received from this device, per meter and polling cycle:
   readings, kWh register, latency and a status — OK, Late, Timeout (the meter
   did not answer), CRC error (corrupt frame, discarded) or Out of range (a value
   outside sane limits, flagged). Filters by meter, status and time range; new
   messages arrive live every polling interval (pause with the Live switch);
   "Raw" shows the payload as the device sent it; Export CSV saves the view.
   Demo mode: messages are generated from the meter registry, steadily (the same
   history on every visit). A backend replaces history() with
   GET /devices/:id/telemetry and live updates with the WebSocket 'reading' event.
   ========================================================================== */
(function () {
  var page = document.getElementById("device-page");
  if (!page) return;
  var id = new URLSearchParams(location.search).get("id") || "GW-01";
  var dev = (window.ED_DEVICES || []).filter(function (d) { return d.id === id; })[0];
  if (!dev) return;
  var ORG = (function () { var s = window.EDStore && EDStore.session(); return s && s.status === "ok" ? s.tenant.id : "ORG"; })();
  var meters = dev.meters.map(function (x) {
    var m = (window.ED_METERS || []).filter(function (mm) { return mm.id === x[0]; })[0];
    return m ? { m: m, slave: x[1] } : null;
  }).filter(Boolean);
  if (!meters.length) return;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fx(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  // steady pseudo-random number in [0,1) for a key
  function rnd(key) { var h = 2166136261; for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }

  var EPOCH = Date.UTC(2026, 0, 1);
  var POLL = (function (p) { var m = /([\d.]+)\s*(s|min)/.exec(p || ""); return m ? (+m[1]) * (m[2] === "min" ? 60 : 1) * 1000 : 15000; })(dev.polling);
  var SOURCE = /MQTT/i.test(dev.uplink) ? "MQTT · ed/" + ORG + "/" + dev.id + "/readings"
    : /HTTPS/i.test(dev.uplink) ? "HTTPS · POST /ingest/v1/readings" : "Modbus TCP poll · " + dev.ip + ":" + dev.port;
  var weak = dev.status === "weak" || dev.signal < 40, offline = dev.status === "offline";
  var STATUS = {
    ok: ["success", "OK"], late: ["warn", "Late"], timeout: ["danger", "Timeout"], crc: ["danger", "CRC error"], range: ["violet", "Out of range"],
  };

  // One message: meter x at time t (ms)
  function message(x, t) {
    var m = x.m, k = dev.id + x.slave + t, r = rnd(k);
    var st = "ok";
    if (offline || m.status === "Offline") st = "timeout";
    else if (r < (weak ? 0.035 : 0.002)) st = "timeout";
    else if (r < (weak ? 0.05 : 0.004)) st = "crc";
    else if (r < (weak ? 0.14 : 0.02)) st = "late";
    else if (r > 0.9985) st = "range";
    var row = { t: t, x: x, status: st, latency: Math.round((st === "late" ? 5200 + rnd(k + "l") * 9000 : (weak ? 380 : 90) + rnd(k + "l") * (weak ? 900 : 160))) };
    if (st === "timeout" || st === "crc") { row.latency = st === "timeout" ? 1000 : row.latency; return row; }
    var hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    var shape = m.power < 0 ? Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)) : 0.82 + 0.18 * Math.sin((hour - 8) / 24 * 2 * Math.PI);
    // smooth drift (minutes-scale waves) plus a little sample noise, as a real feeder behaves
    var wave = Math.sin(t / 7.2e5 + rnd(m.id + "w") * 6) * 0.6 + Math.sin(t / 2.1e5 + rnd(m.id + "z") * 6) * 0.4;
    var kw = Math.abs(m.power) * shape * (1 + 0.05 * wave + 0.02 * (rnd(k + "p") - 0.5));
    var pf = Math.min(0.99, 0.84 + 0.12 * rnd(m.id + "pf") + 0.02 * (rnd(k + "f") - 0.5));
    var three = m.phase !== 1, vln = 230.5 + (rnd(m.id + "v") - 0.5) * 3 + 1.6 * Math.sin(t / 1.5e6) + 0.6 * wave + 0.3 * (rnd(k + "v") - 0.5);
    var i = three ? kw * 1000 / (Math.sqrt(3) * vln * Math.sqrt(3) * pf) : kw * 1000 / (vln * pf);
    row.kw = m.power < 0 ? -kw : kw; row.pf = pf; row.v = vln; row.i = i * (1 + 0.015 * (rnd(k + "i") - 0.5)); row.hz = 50 + 0.05 * Math.sin(t / 3e5) + 0.02 * (rnd(k + "h") - 0.5);
    row.three = three;
    // voltage THD: steady per meter (UPS / drive loads distort more) with a slow drift
    row.thdv = (/MTR-1004/.test(m.id) ? 4.6 : 1.6 + 1.6 * rnd(m.id + "thd")) + 0.35 * Math.sin(t / 9e5 + rnd(m.id + "tw") * 6) + 0.1 * (rnd(k + "td") - 0.5);
    // cumulative register: grows with time since a fixed epoch at roughly the meter's average power
    row.kwh = Math.abs(m.energy) * 140 + (t - EPOCH) / 36e5 * Math.abs(m.power) * 0.8; // only ever rises
    if (st === "range") row.v = 289.4; // flagged: above 1.25 × nominal
    return row;
  }

  function history(spanMs, end) {
    var out = [], start = Math.floor((end - spanMs) / POLL) * POLL;
    for (var t = Math.floor(end / POLL) * POLL; t > start; t -= POLL) meters.forEach(function (x) { out.push(message(x, t)); });
    return out;
  }

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
    '<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Meter</th><th class="num">kW</th><th class="num">Voltage</th><th class="num">Current</th><th class="num">PF</th><th class="num">Hz</th><th class="num">V-THD</th><th class="num">kWh register</th><th class="num">Latency</th><th>Status</th><th></th></tr></thead>' +
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
    '<div class="seg" id="tc-measure" role="group" aria-label="Measure">' +
    '<button type="button" data-m="kw" class="is-on">Power</button><button type="button" data-m="v">Voltage</button><button type="button" data-m="i">Current</button>' +
    '<button type="button" data-m="pf">Power factor</button><button type="button" data-m="thdv">Voltage THD</button><button type="button" data-m="lat">Latency</button></div></div>' +
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
      '<td><strong>' + esc(x.m.name) + '</strong><div class="small muted">Slave ' + x.slave + " · " + esc(x.m.id) + " · " + (x.m.phase === 1 ? "1φ" : "3φ") + "</div></td>" +
      '<td class="num mono">' + (bad ? "—" : fx(r.kw, 1)) + "</td>" +
      '<td class="num mono"' + (r.status === "range" ? ' style="color:var(--rose)"' : "") + ">" + (bad ? "—" : fx(r.v, 1) + " V") + "</td>" +
      '<td class="num mono">' + (bad ? "—" : fx(r.i, 1) + " A") + "</td>" +
      '<td class="num mono">' + (bad ? "—" : fx(r.pf, 2)) + "</td>" +
      '<td class="num mono">' + (bad ? "—" : fx(r.hz, 2)) + "</td>" +
      '<td class="num mono"' + (!bad && r.thdv > 5 ? ' style="color:var(--amber)"' : "") + ">" + (bad ? "—" : fx(r.thdv, 1) + " %") + "</td>" +
      '<td class="num mono">' + (bad ? "—" : fx(r.kwh, 1)) + "</td>" +
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

  function render() {
    var sl = fMeter.value, st = fStatus.value;
    view = all.filter(function (r) {
      return (!sl || String(r.x.slave) === sl) && (!st || (st === "problem" ? r.status !== "ok" : r.status === st));
    });
    tbody.innerHTML = view.length ? view.map(cells).join("") : '<tr><td colspan="12" class="muted" style="text-align:center;padding:28px">No messages match these filters.</td></tr>';
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
    var iso = new Date(r.t).toISOString().replace(/\.\d+Z$/, "Z"), body;
    if (r.status === "timeout") body = { ts: iso, slave: r.x.slave, error: "timeout", detail: "no reply within 1000 ms" };
    else if (r.status === "crc") body = { ts: iso, slave: r.x.slave, error: "crc", detail: "frame checksum mismatch · discarded" };
    else {
      body = { ts: iso, slave: r.x.slave, kw: +r.kw.toFixed(2), pf: +r.pf.toFixed(3), hz: +r.hz.toFixed(2), thd_v: +r.thdv.toFixed(1), kwh_imp: +r.kwh.toFixed(1) };
      if (r.three) { body.v = [r.v, r.v * 0.993, r.v * 1.004].map(function (n) { return +n.toFixed(1); }); body.i = [r.i, r.i * 0.95, r.i * 0.92].map(function (n) { return +n.toFixed(1); }); }
      else { body.v = [+r.v.toFixed(1)]; body.i = [+r.i.toFixed(1)]; }
    }
    var envelope = { device: dev.id, seq: Math.floor(r.t / POLL) % 1000000, readings: [body] };
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
    var lines = [["Time", "Meter ID", "Meter", "Slave", "Phase", "kW", "Voltage (V)", "Current (A)", "PF", "Hz", "Voltage THD (%)", "kWh register", "Latency (ms)", "Status"].join(",")];
    view.forEach(function (r) {
      var bad = r.status === "timeout" || r.status === "crc";
      lines.push([new Date(r.t).toISOString(), r.x.m.id, '"' + r.x.m.name.replace(/"/g, '""') + '"', r.x.slave, r.x.m.phase === 1 ? "1" : "3",
        bad ? "" : r.kw.toFixed(2), bad ? "" : r.v.toFixed(1), bad ? "" : r.i.toFixed(1), bad ? "" : r.pf.toFixed(3), bad ? "" : r.hz.toFixed(2), bad ? "" : r.thdv.toFixed(1), bad ? "" : r.kwh.toFixed(1),
        r.status === "timeout" ? "" : r.latency, STATUS[r.status][1]].join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = dev.id + "-telemetry.csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  var MEASURES = {
    kw: { label: "Power", unit: "kW", d: 1, zero: true, get: function (r) { return r.kw; } },
    v: { label: "Voltage", unit: "V", d: 1, get: function (r) { return r.v; } },
    i: { label: "Current", unit: "A", d: 1, zero: true, get: function (r) { return r.i; } },
    pf: { label: "Power factor", unit: "", d: 2, get: function (r) { return r.pf; } },
    thdv: { label: "Voltage THD", unit: "%", d: 1, zero: true, get: function (r) { return r.thdv; } },
    lat: { label: "Latency", unit: "ms", d: 0, zero: true, get: function (r) { return r.latency; } },
  };
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
    var box = $("#tc-box"), M = MEASURES[measure];
    var span = +fSpan.value, end = Math.floor(Date.now() / POLL) * POLL, start = end - span + POLL;
    var shown = meters.filter(function (x) { return !fMeter.value || String(x.slave) === fMeter.value; });
    // per meter: points ascending in time; value null when the message was lost
    var series = shown.map(function (x) {
      var pts = all.filter(function (r) { return r.x === x; }).sort(function (p, q) { return p.t - q.t; }).map(function (r) {
        var lost = r.status === "timeout" || r.status === "crc" || r.status === "range"; // flagged values stay off the line (see status strip)
        return { t: r.t, r: r, y: measure === "lat" ? (r.status === "timeout" ? null : r.latency) : lost ? null : M.get(r) };
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
