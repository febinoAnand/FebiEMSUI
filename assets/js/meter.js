/* ==========================================================================
   Energy Dashboard — individual meter dashboard (meter.html?id=MTR-1001 | SM-1001-04)
   Reads the meter registry (meter-data.js). Hourly / daily history is demo data,
   generated deterministically per meter (same meter → same curve) and scaled to
   that meter's live power and month-to-date energy.
   ========================================================================== */
(function () {
  var METERS = window.ED_METERS || [];
  var TARIFF = 8; // ₹ / kWh (dashboard tariff)
  var CO2 = 0.82; // kg CO₂ / kWh (Settings → emission factor)
  var page = document.getElementById("meter-page");
  if (!page) return;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function kw(n) { return (n < 0 ? "−" : "") + fmt(Math.abs(n), 1) + " kW"; }
  function hhmm(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2); }
  function rng(seed) { // mulberry32
    var t = 0; for (var i = 0; i < seed.length; i++) t = (t * 31 + seed.charCodeAt(i)) | 0;
    return function () { t = (t + 0x6D2B79F5) | 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  var STATUS = { Online: "success", Idle: "warn", Offline: "danger", Maintenance: "violet", Generating: "blue", Standby: "info" };
  function badge(st) { return '<span class="badge badge--' + (STATUS[st] || "info") + '"><span class="dot' + (st === "Online" || st === "Generating" ? " dot--live" : "") + '"></span> ' + esc(st) + "</span>"; }

  /* ---------- find the meter ---------- */
  var id = (new URLSearchParams(location.search).get("id") || "").toUpperCase();
  var meter = null, parent = null;
  METERS.forEach(function (m) {
    if (m.id === id) meter = m;
    m.subs.forEach(function (s) { if (s.id === id) { meter = s; parent = m; } });
  });
  if (!meter) {
    page.innerHTML = '<section class="card" style="max-width:560px;margin:40px auto"><div class="card__body center"><span class="icon-tile icon-tile--amber auth-icon auth-icon--round"><i class="ic i-alert"></i></span><h2 class="page-title" style="font-size:22px">Meter not found</h2><p class="page-sub">' +
      (id ? "There is no meter or sub-meter with ID <b class=\"mono\">" + esc(id) + "</b>." : "Open a meter from the Energy Meters list.") +
      '</p><a href="meters.html" class="btn btn--primary" style="margin-top:18px"><i class="ic i-arrow-left"></i> Back to Energy Meters</a></div></section>';
    return;
  }
  var isSub = !!parent, main = parent || meter;
  var kind = main.kind, gen = kind === "generator";
  document.title = meter.name + " · " + meter.id + " · Energy Dashboard";
  var crumb = document.querySelector(".topbar__crumbs strong");
  if (crumb) crumb.textContent = meter.name;

  /* ---------- demo history ---------- */
  var now = new Date(), H = now.getHours() + now.getMinutes() / 60, day = now.getDate();
  var name = (meter.name + " " + main.name).toLowerCase();
  function shape(h) {
    if (/solar/.test(name)) return h < 6 || h > 18.5 ? 0 : Math.pow(Math.sin(Math.PI * (h - 6) / 12.5), 1.4);
    if (/dg set/.test(name)) return 0;
    if (/data centre|server|ups|cooling|crac/.test(name)) return 0.9 + 0.08 * Math.sin(h / 3);
    if (/lighting|street|yard|flood/.test(name)) return h >= 18 || h < 6 ? 1 : h < 7 || h > 17 ? 0.5 : 0.18;
    if (/office|admin|canteen|kitchen|amenit|hvac|ahu|chiller|ac /.test(name)) return h < 7 ? 0.2 : h < 9 ? 0.2 + 0.4 * (h - 7) : h < 18 ? 1 - 0.1 * Math.abs(13 - h) / 5 : h < 20 ? 0.5 : 0.22;
    if (/pump|water/.test(name)) return (h > 5 && h < 9) || (h > 16 && h < 20) ? 1 : 0.35;
    if (/ev /.test(name + " ")) return h > 9 && h < 19 ? 0.75 + 0.25 * Math.sin((h - 9) / 3) : 0.1;
    return h < 6 ? 0.42 : h < 8 ? 0.42 + 0.29 * (h - 6) : h < 22 ? 0.95 + 0.05 * Math.sin(h) : 0.55; // production / shifts
  }
  var R = rng(meter.id);
  var absPower = Math.abs(meter.power);
  var rated = meter.load > 0 ? absPower / (meter.load / 100) : Math.max(1, Math.abs(meter.energy) / (day * 24) * 2.2);
  var shNow = shape(H);
  var scale = absPower > 0 && shNow > 0.05 ? absPower / shNow : rated * 0.8;
  var stoppedAt = meter.status === "Offline" ? Math.min(H, 11) : meter.status === "Maintenance" ? Math.min(H, 8) : null;
  var hourly = []; // points every 15 min up to now
  for (var t = 0; t <= H + 1e-9; t += 0.25) {
    var val = meter.status === "Standby" || /dg set/.test(name) ? 0 : Math.max(0, shape(t) * scale * (0.93 + 0.14 * R()));
    if (stoppedAt !== null && t > stoppedAt) val = meter.status === "Offline" ? null : 0;
    hourly.push({ x: t, y: val });
  }
  hourly.push({ x: H, y: stoppedAt !== null ? (meter.status === "Offline" ? null : 0) : absPower });
  var todayKwh = 0, peak = { y: 0, x: 0 };
  hourly.forEach(function (p, i) { if (p.y != null) { if (i < hourly.length - 1) todayKwh += p.y * 0.25; if (p.y > peak.y) peak = p; } });
  // daily energy this month; today = the energy integrated above
  var monthKwh = Math.abs(meter.energy), rest = Math.max(0, monthKwh - todayKwh), weights = [], wsum = 0;
  for (var d = 1; d < day; d++) {
    var dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    var w = (gen ? 0.55 + 0.6 * R() : (dow === 0 ? 0.55 : 1) * (0.88 + 0.24 * R()));
    weights.push(w); wsum += w;
  }
  var daily = weights.map(function (w, i) { return { x: i + 1, y: wsum ? rest * w / wsum : 0 }; });
  daily.push({ x: day, y: todayKwh, partial: true });

  /* ---------- electrical parameters (demo, consistent with power) ---------- */
  var pf = meter.id === "MTR-1001" ? 0.86 : gen ? 0.99 : +(0.9 + 0.08 * R()).toFixed(2);
  var live = absPower > 0 && stoppedAt === null;
  var v = [230 + 4 * R() - 2, 230 + 4 * R() - 2, 230 + 4 * R() - 2];
  var iPh = live ? v.map(function (vv, i) { return absPower * 1000 / (3 * vv * pf) * (0.94 + 0.12 * [R(), R(), R()][i]); }) : [0, 0, 0];
  var kva = live ? absPower / pf : 0, kvar = live ? Math.sqrt(Math.max(0, kva * kva - absPower * absPower)) : 0;

  /* ---------- rules watching this meter (from Alerts → Alert rules) ---------- */
  var RULES = [
    ["Overload > 90% rated", "Load % > 90 for 5 min", "Critical", ["MTR-1002+"]],
    ["Low power factor", "PF < 0.95 for 15 min", "Warning", ["MTR-1001"]],
    ["Meter offline", "No data 10 min", "Critical", ["ALL"]],
    ["Contract demand", "> 95% of 160 kVA", "Warning", ["MTR-1001"]],
    ["After-hours usage", "> 2 kW, 20:00–06:00", "Warning", ["MTR-1003+"]],
    ["Voltage imbalance", "> 3 % for 10 min", "Warning", ["ALL-SUBS"]],
    ["Daily budget", "kWh / day > target by 5%", "Info", ["ALL"]],
    ["THD", "THD > 8 %", "Warning", ["MTR-1004"]],
    ["Compressor overload", "> 48 kW for 5 min", "Critical", ["MTR-1006"]],
    ["Welding bay idle draw", "> 1.5 kW, 22:00–06:00", "Info", ["SM-1001-04"]],
  ];
  var rules = RULES.filter(function (r) {
    return r[3].some(function (t) {
      return t === "ALL" || t === meter.id || (t === "ALL-SUBS" && isSub) || (t === "ALL-METERS" && !isSub) || (isSub && t === parent.id + "+") || (!isSub && t === meter.id + "+");
    });
  });
  var SEV = { Critical: "danger", Warning: "warn", Info: "info" };

  /* ---------- render ---------- */
  var subsSum = null;
  if (!isSub && meter.subs.length) {
    subsSum = meter.subs.reduce(function (a, s) { a.p += s.power; a.e += s.energy; return a; }, { p: 0, e: 0 });
  }
  var lastSeen = meter.status === "Offline" ? "No data since " + hhmm(stoppedAt) : "Last reading 10 s ago";
  var tile = function (icon, c, value, unit, label, foot) {
    return '<div class="card stat"><span class="stat__icon" style="--c:var(' + c + ')"><i class="ic ' + icon + '"></i></span><div><strong>' + value + (unit ? ' <small class="muted" style="font-size:13px">' + unit + "</small>" : "") + "</strong><span>" + label + "</span>" + (foot ? '<div class="small muted" style="margin-top:2px">' + foot + "</div>" : "") + "</div></div>";
  };

  var html = "";
  html += '<section class="page-head"><div class="meter-head">' +
    '<span class="dev-icon" style="--c:var(' + (isSub ? "--primary" : main.color) + ')"><i class="ic ' + (isSub ? "i-layers" : main.icon) + '"></i></span>' +
    '<div style="min-width:0"><span class="eyebrow">' + (isSub ? "Sub-meter of " + esc(parent.name) : gen ? "Main meter · generation" : "Main meter") + "</span>" +
    '<h1 class="page-title" style="margin-top:2px">' + esc(meter.name) + "</h1>" +
    '<div class="meter-meta"><span class="tag">' + esc(meter.id) + "</span>" + badge(meter.status) +
    '<span class="page-sub" style="margin:0">' + esc(isSub ? meter.ct + " · via parent meter" : meter.model + " · " + meter.location) + "</span>" +
    '<a href="devices.html" class="device-chip' + (isSub ? " device-chip--inherited" : "") + '" title="' + esc(main.deviceName) + '"><span class="dot dot--live" style="--c:var(--green)"></span>' + esc(main.device) + "</a></div></div></div>" +
    '<div class="page-actions">' +
    (isSub ? '<a href="meter.html?id=' + esc(parent.id) + '" class="btn btn--sm"><i class="ic i-arrow-left"></i> ' + esc(parent.name) + "</a>" : '<a href="meters.html" class="btn btn--sm"><i class="ic i-arrow-left"></i> All meters</a>') +
    '<a href="#close" class="btn btn--sm"><i class="ic i-download"></i> Export CSV</a>' +
    '<a href="alerts.html?target=' + encodeURIComponent(meter.id) + '#add-rule" class="btn btn--sm btn--primary"><i class="ic i-bell"></i> Set alert</a></div></section>';

  var monthLabel = now.toLocaleDateString(undefined, { month: "long" });
  html += '<section class="grid grid-4">' +
    tile(gen ? "i-sun" : "i-bolt", "--primary", live ? fmt(absPower, 1) : "0.0", "kW", gen ? "Generating now" : "Power now", meter.load > 0 ? meter.load + "% of rated " + fmt(rated, 0) + " kW" : lastSeen) +
    tile("i-activity", "--cyan", fmt(todayKwh, 0), "kWh", gen ? "Generated today" : "Energy today", "₹" + fmt(todayKwh * TARIFF, 0) + " · " + fmt(todayKwh * CO2, 0) + " kg CO₂") +
    tile("i-calendar", "--violet", fmt(monthKwh, 0), "kWh", (gen ? "Generated in " : "Energy in ") + monthLabel, "₹" + fmt(monthKwh * TARIFF, 0) + (gen ? " saved" : "") + " · " + fmt(monthKwh * CO2 / 1000, 2) + " t CO₂" + (gen ? " avoided" : "")) +
    tile("i-trend-up", "--amber", fmt(peak.y, 1), "kW", "Peak today", peak.y > 0 ? "at " + hhmm(peak.x) : "No demand yet today") +
    "</section>";

  html += '<section class="grid grid-main">' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-activity"></i> ' + (gen ? "Generation" : "Power") + ' today</h3><p class="card__sub">15-minute readings · kW · hover for values</p></div></div>' +
    '<div class="card__body"><div class="chart-box" id="chart-power"></div>' + tableFor(hourly.filter(function (p, i) { return i % 4 === 0; }), "Time", "kW", function (p) { return hhmm(p.x); }, 1) + "</div></div>" +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-gauge"></i> Electrical parameters</h3><p class="card__sub">' + esc(lastSeen) + "</p></div></div>" +
    '<div class="card__body"><table class="table param-table"><thead><tr><th>Phase</th><th>Voltage</th><th>Current</th></tr></thead><tbody>' +
    ["L1", "L2", "L3"].map(function (l, i) { return "<tr><td>" + l + "</td><td>" + fmt(v[i], 1) + " V</td><td>" + fmt(iPh[i], 1) + " A</td></tr>"; }).join("") +
    '</tbody></table><dl class="kv" style="margin-top:16px">' +
    "<dt>Power factor</dt><dd" + (pf < 0.95 && live ? ' class="tc-rose"' : "") + ">" + (live ? pf.toFixed(2) : "—") + "</dd>" +
    "<dt>Apparent power</dt><dd>" + (live ? fmt(kva, 1) + " kVA" : "—") + "</dd>" +
    "<dt>Reactive power</dt><dd>" + (live ? fmt(kvar, 1) + " kVAr" : "—") + "</dd>" +
    "<dt>Frequency</dt><dd>" + (live ? (49.95 + 0.1 * R()).toFixed(2) + " Hz" : "—") + "</dd>" +
    "<dt>THD (V / I)</dt><dd>" + (live ? (1.8 + 1.5 * R()).toFixed(1) + " % / " + (4 + (meter.id === "MTR-1004" ? 5 : 3) * R()).toFixed(1) + " %" : "—") + "</dd>" +
    (isSub ? "" : "<dt>Rated load</dt><dd>" + fmt(rated, 0) + " kW</dd>") +
    "</dl></div></div></section>";

  html += '<section class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-chart"></i> ' + (gen ? "Daily generation" : "Daily energy") + " · " + esc(monthLabel) + '</h3><p class="card__sub">kWh per day · today is still running (lighter bar)</p></div></div>' +
    '<div class="card__body"><div class="chart-box" id="chart-daily"></div>' + tableFor(daily, "Day", "kWh", function (p) { return p.x + " " + monthLabel.slice(0, 3) + (p.partial ? " (today)" : ""); }, 0) + "</div></section>";

  // Main meters: actual vs Σ sub-meters and each sub-meter's share
  if (subsSum) {
    var gapE = meter.energy - subsSum.e, gapPct = subsSum.e ? gapE / Math.abs(subsSum.e) * 100 : 0;
    var total = Math.abs(meter.energy);
    var rows = meter.subs.slice().sort(function (a, b) { return Math.abs(b.energy) - Math.abs(a.energy); }).map(function (s) {
      var share = total ? Math.abs(s.energy) / total * 100 : 0;
      return '<div class="share-row"><a href="meter.html?id=' + esc(s.id) + '" title="Open ' + esc(s.name) + ' dashboard">' + esc(s.name) + '</a><div class="bar"><span style="--w:' + share.toFixed(1) + '%"></span></div><b>' + fmt(Math.abs(s.energy), 0) + " kWh · " + share.toFixed(1) + "%</b></div>";
    }).join("");
    var restShare = total ? Math.abs(gapE) / total * 100 : 0;
    rows += '<div class="share-row share-row--rest"><span class="muted">' + (gapE >= 0 ? "Unmetered / losses" : "Losses") + '</span><div class="bar"><span style="--w:' + restShare.toFixed(1) + '%"></span></div><b>' + fmt(Math.abs(gapE), 0) + " kWh · " + restShare.toFixed(1) + "%</b></div>";
    html += '<section class="grid grid-main-r">' +
      '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-layers"></i> Actual vs sub-meters</h3><p class="card__sub">' + esc(monthLabel) + " · this meter vs the sum of its " + meter.subs.length + " sub-meters</p></div></div>" +
      '<div class="card__body"><dl class="kv">' +
      "<dt>Actual (this meter)</dt><dd class=\"mono\">" + fmt(monthKwh, 0) + " kWh · " + kw(meter.power) + "</dd>" +
      "<dt>Σ sub-meters</dt><dd class=\"mono\">" + fmt(Math.abs(subsSum.e), 0) + " kWh · " + kw(subsSum.p) + "</dd>" +
      "<dt>Δ gap</dt><dd><span class=\"gap " + (Math.abs(gapPct) >= 5 ? "gap--high" : Math.abs(gapPct) >= 3 ? "gap--mid" : "gap--ok") + "\">" + (gapE >= 0 ? "+" : "−") + fmt(Math.abs(gapE), 0) + " kWh · " + Math.abs(gapPct).toFixed(1) + "%</span></dd>" +
      '</dl><p class="hint" style="margin-top:14px">A gap above 5% usually means an unmetered load, a faulty CT or a sub-meter that stopped reporting.</p></div></div>' +
      '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-chart"></i> Share by sub-meter</h3><p class="card__sub">' + esc(monthLabel) + " energy · click a sub-meter to open its dashboard</p></div></div>" +
      '<div class="card__body"><div class="share-list">' + rows + "</div></div></div></section>";
  }

  // Sub-meters table (main meters) or parent summary (sub-meters)
  var bottomLeft;
  if (!isSub && meter.subs.length) {
    bottomLeft = '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-layers"></i> Sub-meters (' + meter.subs.length + ')</h3><p class="card__sub">Live values · each has its own dashboard</p></div></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Sub-meter</th><th>CT</th><th class="num">Power</th><th class="num">Energy (kWh)</th><th>Status</th><th></th></tr></thead><tbody>' +
      meter.subs.map(function (s) {
        return '<tr><td><div class="cell-device"><span class="dev-icon"><i class="ic i-layers"></i></span><div><a href="meter.html?id=' + esc(s.id) + '" class="row-link"><strong>' + esc(s.name) + "</strong></a><small>" + esc(s.id) + '</small></div></div></td><td><span class="tag">' + esc(s.ct) + '</span></td><td class="num">' + kw(s.power) + '</td><td class="num">' + fmt(Math.abs(s.energy), 0) + "</td><td>" + badge(s.status) + '</td><td><div class="actions"><a href="meter.html?id=' + esc(s.id) + '" class="act act--view" title="Open dashboard"><i class="ic i-eye"></i></a></div></td></tr>';
      }).join("") + "</tbody></table></div></div>";
  } else {
    var share = isSub && parent.energy ? Math.abs(meter.energy) / Math.abs(parent.energy) * 100 : 0;
    bottomLeft = '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-gauge"></i> ' + (isSub ? "Parent meter" : "Meter details") + "</h3></div></div>" +
      '<div class="card__body"><dl class="kv">' +
      (isSub ? '<dt>Parent meter</dt><dd><a href="meter.html?id=' + esc(parent.id) + '" class="tc-primary">' + esc(parent.name) + " · " + esc(parent.id) + "</a></dd>" +
        "<dt>Share of parent (" + esc(monthLabel) + ")</dt><dd>" + share.toFixed(1) + " %</dd><dt>Connection</dt><dd>" + esc(meter.ct) + "</dd><dt>Load</dt><dd>" + meter.load + " %</dd>"
        : "<dt>Make &amp; model</dt><dd>" + esc(meter.model) + "</dd><dt>Location</dt><dd>" + esc(meter.location) + "</dd><dt>Type</dt><dd>" + (gen ? "Generator" : "Consumer") + "</dd><dt>Sub-meters</dt><dd>None</dd>") +
      "</dl></div></div>";
  }
  var rulesHtml = rules.length ? rules.map(function (r) {
    return '<div class="list__item"><span class="icon-tile icon-tile--amber"><i class="ic i-bell"></i></span><span class="grow"><strong>' + esc(r[0]) + '</strong><small class="mono">' + esc(r[1]) + '</small></span><span class="badge badge--' + SEV[r[2]] + '">' + r[2] + "</span></div>";
  }).join("") : '<p class="muted small">No rules watch this meter yet.</p>';
  html += '<section class="grid ' + (!isSub && meter.subs.length ? "grid-main" : "grid-2") + '">' + bottomLeft +
    '<div class="stack">' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-cpu"></i> Reporting device</h3><p class="card__sub">' + (isSub ? "Inherited from " + esc(parent.name) : "Polled every 15 s") + "</p></div></div>" +
    '<div class="card__body"><dl class="kv"><dt>Device</dt><dd><a href="devices.html" class="tc-primary">' + esc(main.device) + " · " + esc(main.deviceName) + "</a></dd><dt>Status</dt><dd>" + esc(lastSeen) + "</dd></dl></div></div>" +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-bell"></i> Alert rules (' + rules.length + ')</h3><p class="card__sub">Rules that watch this ' + (isSub ? "sub-meter" : "meter") + '</p></div><a href="alerts.html?target=' + encodeURIComponent(meter.id) + '#add-rule" class="btn btn--sm btn--soft"><i class="ic i-plus"></i> Set alert</a></div>' +
    '<div class="card__body"><div class="list">' + rulesHtml + "</div></div></div>" +
    "</div></section>";

  page.innerHTML = html;

  /* ---------- charts ---------- */
  function tableFor(pts, xl, yl, xf, dp) {
    return '<details class="chart-table"><summary>View as table</summary><div class="table-wrap"><table class="table"><thead><tr><th>' + xl + '</th><th class="num">' + yl + "</th></tr></thead><tbody>" +
      pts.map(function (p) { return "<tr><td>" + xf(p) + '</td><td class="num">' + (p.y == null ? "—" : fmt(p.y, dp)) + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
  }
  // Axis max = 4 round steps (1, 2, 2.5 or 5 × 10ⁿ) so every tick label is a round number
  function niceMax(v) { if (v <= 0) return 4; var st = v / 4, p = Math.pow(10, Math.floor(Math.log10(st))), n = st / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p * 4; }
  function frame(el, h) {
    var W = Math.max(280, el.clientWidth), pad = { l: 44, r: 12, t: 24, b: 26 };
    return { W: W, H: h, pad: pad, iw: W - pad.l - pad.r, ih: h - pad.t - pad.b };
  }
  function yAxis(f, max, unit) {
    var s = "";
    for (var i = 0; i <= 4; i++) {
      var val = max * i / 4, y = f.pad.t + f.ih - f.ih * i / 4;
      s += '<line class="grid-line" x1="' + f.pad.l + '" x2="' + (f.W - f.pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="axis-text" x="' + (f.pad.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(val, (max / 4) % 1 ? 1 : 0) + "</text>";
    }
    return s + '<text class="axis-text" x="' + (f.pad.l - 8) + '" y="' + (f.pad.t - 12) + '" text-anchor="end">' + unit + "</text>";
  }
  function tip(el) {
    var t = el.querySelector(".chart-tip");
    if (!t) { t = document.createElement("div"); t.className = "chart-tip"; t.hidden = true; el.appendChild(t); }
    return t;
  }

  function drawPower() {
    var el = document.getElementById("chart-power"), f = frame(el, 240);
    var max = niceMax(Math.max(peak.y, rated * 0.3) * 1.1);
    var X = function (x) { return f.pad.l + f.iw * x / 24; }, Y = function (y) { return f.pad.t + f.ih - f.ih * y / max; };
    var seg = [], segs = [];
    hourly.forEach(function (p) { if (p.y == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push(p); });
    if (seg.length) segs.push(seg);
    var paths = segs.map(function (s) {
      var d = s.map(function (p, i) { return (i ? "L" : "M") + X(p.x).toFixed(1) + "," + Y(p.y).toFixed(1); }).join("");
      return '<path class="series-area" d="' + d + "L" + X(s[s.length - 1].x).toFixed(1) + "," + Y(0) + "L" + X(s[0].x).toFixed(1) + "," + Y(0) + 'Z"/><path class="series-line" d="' + d + '"/>';
    }).join("");
    var xt = "";
    for (var h = 0; h <= 24; h += 3) xt += '<text class="axis-text" x="' + X(h) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + ("0" + h).slice(-2) + "</text>";
    var last = hourly[hourly.length - 1], note = "";
    if (meter.status === "Offline") note = '<text class="gap-note" x="' + (X(stoppedAt) + 8) + '" y="' + (f.pad.t + 14) + '">No data since ' + hhmm(stoppedAt) + "</text>";
    var dot = last.y != null ? '<circle class="now-dot" cx="' + X(last.x) + '" cy="' + Y(last.y) + '" r="5"/>' : "";
    el.innerHTML = '<svg width="' + f.W + '" height="' + f.H + '" role="img" aria-label="' + esc((gen ? "Generation" : "Power") + " today, peak " + fmt(peak.y, 1) + " kW at " + hhmm(peak.x)) + '">' +
      yAxis(f, max, "kW") + xt + paths + note + dot +
      '<line class="cross" y1="' + f.pad.t + '" y2="' + (f.pad.t + f.ih) + '" visibility="hidden"/><circle class="hover-dot" r="5" visibility="hidden"/>' +
      '<rect x="' + f.pad.l + '" y="' + f.pad.t + '" width="' + f.iw + '" height="' + f.ih + '" fill="transparent"/></svg>';
    var svg = el.querySelector("svg"), cross = svg.querySelector(".cross"), hd = svg.querySelector(".hover-dot"), t = tip(el);
    svg.lastChild.addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left - f.pad.l) / f.iw * 24;
      var best = null;
      hourly.forEach(function (p) { if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
      if (!best || x > H + 0.3) { t.hidden = true; cross.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); return; }
      cross.setAttribute("x1", X(best.x)); cross.setAttribute("x2", X(best.x)); cross.setAttribute("visibility", "visible");
      if (best.y != null) { hd.setAttribute("cx", X(best.x)); hd.setAttribute("cy", Y(best.y)); hd.setAttribute("visibility", "visible"); } else hd.setAttribute("visibility", "hidden");
      t.innerHTML = hhmm(best.x) + " · <b>" + (best.y == null ? "no data" : fmt(best.y, 1) + " kW") + "</b>";
      t.style.left = X(best.x) + "px"; t.style.top = (best.y != null ? Y(best.y) : f.pad.t + 20) + "px"; t.hidden = false;
    });
    svg.lastChild.addEventListener("mouseleave", function () { t.hidden = true; cross.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); });
  }

  function drawDaily() {
    var el = document.getElementById("chart-daily"), f = frame(el, 220);
    var n = daily.length, max = niceMax(Math.max.apply(null, daily.map(function (p) { return p.y; })) * 1.1);
    var slot = f.iw / n, bw = Math.max(3, slot - 2), Y = function (y) { return f.pad.t + f.ih - f.ih * y / max; };
    var bars = daily.map(function (p, i) {
      var x = f.pad.l + i * slot + (slot - bw) / 2, y = Y(p.y), h = f.pad.t + f.ih - y, r = Math.min(4, bw / 2, h);
      var d = h <= 0 ? "" : "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + bw - r) + "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + "V" + (y + h) + "Z";
      return '<path class="series-bar' + (p.partial ? " is-partial" : "") + '" data-i="' + i + '" d="' + d + '"/>' +
        '<rect data-i="' + i + '" x="' + (f.pad.l + i * slot) + '" y="' + f.pad.t + '" width="' + slot + '" height="' + f.ih + '" fill="transparent"/>';
    }).join("");
    var xt = "", step = n > 20 ? 5 : n > 10 ? 2 : 1;
    daily.forEach(function (p, i) { if (p.x === 1 || p.x % step === 0 || p.partial) xt += '<text class="axis-text" x="' + (f.pad.l + i * slot + slot / 2) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + p.x + "</text>"; });
    el.innerHTML = '<svg width="' + f.W + '" height="' + f.H + '" role="img" aria-label="' + esc("Daily energy this month, total " + fmt(monthKwh, 0) + " kWh") + '">' + yAxis(f, max, "kWh") + xt + bars + "</svg>";
    var t = tip(el), svg = el.querySelector("svg");
    svg.addEventListener("mousemove", function (e) {
      var i = e.target.getAttribute && e.target.getAttribute("data-i");
      svg.querySelectorAll(".series-bar.is-hover").forEach(function (b) { b.classList.remove("is-hover"); });
      if (i == null) { t.hidden = true; return; }
      var p = daily[+i], bar = svg.querySelector('.series-bar[data-i="' + i + '"]');
      if (bar) bar.classList.add("is-hover");
      var dt = new Date(now.getFullYear(), now.getMonth(), p.x);
      t.innerHTML = dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + (p.partial ? " (so far)" : "") + " · <b>" + fmt(p.y, 0) + " kWh</b>";
      t.style.left = (f.pad.l + +i * slot + slot / 2) + "px"; t.style.top = Y(p.y) + "px"; t.hidden = false;
    });
    svg.addEventListener("mouseleave", function () { t.hidden = true; svg.querySelectorAll(".series-bar.is-hover").forEach(function (b) { b.classList.remove("is-hover"); }); });
  }

  function drawAll() { drawPower(); drawDaily(); }
  drawAll();
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(drawAll, 150); });
})();
