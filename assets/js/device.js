/* ==========================================================================
   Energy Dashboard — device details (device.html?id=GW-01)
   Registry: device-data.js · meter values: meter-data.js.
   Signal history, availability and the event log are demo data generated
   deterministically per device (same device → same history).
   ========================================================================== */
(function () {
  var DEVICES = window.ED_DEVICES || [], METERS = window.ED_METERS || [];
  var page = document.getElementById("device-page");
  if (!page) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function hhmm(h) { h = ((h % 24) + 24) % 24; var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh = (hh + 1) % 24; mm = 0; } return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2); }
  function rng(seed) {
    var t = 0; for (var i = 0; i < seed.length; i++) t = (t * 31 + seed.charCodeAt(i)) | 0;
    return function () { t = (t + 0x6D2B79F5) | 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  var DSTATUS = { online: ["success", "Online", true], weak: ["warn", "Weak signal"], offline: ["danger", "Offline"] };
  var MSTATUS = { Online: "success", Idle: "warn", Offline: "danger", Maintenance: "violet", Generating: "blue", Standby: "info" };
  function dBadge(st) { var s = DSTATUS[st] || DSTATUS.offline; return '<span class="badge badge--' + s[0] + '"><span class="dot' + (s[2] ? " dot--live" : "") + '"></span> ' + s[1] + "</span>"; }

  var toastTimer;
  function toast(title, text) {
    var t = document.getElementById("device-toast");
    t.querySelector("[data-toast-title]").textContent = title;
    t.querySelector("[data-toast-text]").textContent = text;
    t.classList.remove("is-shown"); void t.offsetWidth; t.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-shown"); }, 4000);
  }

  /* ---------- find the device ---------- */
  var id = (new URLSearchParams(location.search).get("id") || "").toUpperCase();
  var dev = DEVICES.filter(function (d) { return d.id === id; })[0];
  if (!dev) {
    page.innerHTML = '<section class="card" style="max-width:560px;margin:40px auto"><div class="card__body center"><span class="icon-tile icon-tile--amber auth-icon auth-icon--round"><i class="ic i-alert"></i></span><h2 class="page-title" style="font-size:22px">Device not found</h2><p class="page-sub">' +
      (id ? "There is no device with ID <b class=\"mono\">" + esc(id) + "</b>." : "Open a device from Device Management.") +
      '</p><a href="devices.html" class="btn btn--primary" style="margin-top:18px"><i class="ic i-arrow-left"></i> All devices</a></div></section>';
    return;
  }
  document.title = dev.name + " · " + dev.id + " · Energy Dashboard";
  var crumb = document.querySelector(".topbar__crumbs strong");
  if (crumb) crumb.textContent = dev.name;

  var meters = dev.meters.map(function (x) {
    var m = METERS.filter(function (mm) { return mm.id === x[0]; })[0];
    return m ? { m: m, slave: x[1] } : null;
  }).filter(Boolean);
  var reporting = meters.filter(function (x) { return x.m.status !== "Offline"; }).length;
  var subs = meters.reduce(function (n, x) { return n + x.m.subs.length; }, 0);

  /* ---------- demo history: signal every 15 min over the last 24 h ---------- */
  var R = rng(dev.id), now = new Date(), H = now.getHours() + now.getMinutes() / 60;
  var wired = dev.link === "Ethernet";
  var signal = [];
  for (var i = 0; i <= 96; i++) {
    var x = i / 4 - 24; // hours ago → negative offset
    var base = wired ? 100 : dev.signal + 10 * Math.sin((i / 96) * Math.PI * 3) + (R() - 0.5) * 14;
    signal.push({ x: x, y: Math.max(0, Math.min(100, Math.round(base))) });
  }
  signal[signal.length - 1].y = dev.signal;
  var avail = wired ? 99.4 + R() * 0.5 : Math.min(99.2, 88 + dev.signal / 8 + R() * 3);
  var drops = signal.filter(function (p) { return p.y < 40; }).length;

  /* ---------- demo event log ---------- */
  var DAY = 864e5, ev = [];
  var inst = new Date(dev.installed + "T10:30:00").getTime();
  ev.push([inst, "Installed and commissioned", "--primary"]);
  if (dev.firmwareNew) ev.push([now - (18 + Math.floor(R() * 10)) * DAY, "Firmware " + dev.firmware + " installed · " + dev.firmwareNew + " is now available", "--violet"]);
  else ev.push([now - (20 + Math.floor(R() * 20)) * DAY, "Firmware updated to " + dev.firmware, "--violet"]);
  ev.push([now - dev.uptimeDays * DAY, "Restarted" + (R() > 0.5 ? " after power interruption" : " by admin"), "--cyan"]);
  meters.forEach(function (x) { if (x.m.status === "Offline") ev.push([now - (1.2 + R()) * 3600e3, x.m.name + " (" + x.m.id + ") stopped responding · slave ID " + x.slave, "--rose"]); });
  if (dev.status === "weak") ev.push([now - 3 * 3600e3, "Signal dropped below 40%", "--amber"]);
  ev.sort(function (a, b) { return b[0] - a[0]; });

  /* ---------- render ---------- */
  // Detail rows carry field-level permission keys (Roles & Permissions → Field-level)
  var FIELD = { "IP address": "ip", "MAC": "mac", "Connectivity": "network", "Field protocol": "protocol", "Uplink": "protocol", "Polling interval": "polling",
    "RS-485 baud rate": "polling", "Type": "type", "Make &amp; model": "model", "Serial number": "serial", "Firmware": "firmware", "Installed at": "location" };
  var kv = function (rows) {
    return '<dl class="kv">' + rows.map(function (r) {
      var fa = FIELD[r[0]] ? ' data-field="devices.' + FIELD[r[0]] + '"' : "";
      return "<dt" + fa + ">" + r[0] + "</dt><dd" + fa + ">" + r[1] + "</dd>";
    }).join("") + "</dl>";
  };
  var tile = function (icon, c, v, label, foot) {
    return '<div class="card stat"><span class="stat__icon" style="--c:var(' + c + ')"><i class="ic ' + icon + '"></i></span><div><strong>' + v + "</strong><span>" + label + "</span>" + (foot ? '<div class="small muted" style="margin-top:2px">' + foot + "</div>" : "") + "</div></div>";
  };
  var html = '<section class="page-head"><div class="meter-head">' +
    '<span class="dev-icon" style="--c:var(' + dev.color + ')"><i class="ic ' + dev.icon + '"></i></span>' +
    '<div style="min-width:0"><span class="eyebrow">' + esc(dev.type) + "</span>" +
    '<h1 class="page-title" style="margin-top:2px">' + esc(dev.name) + "</h1>" +
    '<div class="meter-meta"><span class="tag">' + esc(dev.id) + "</span>" + dBadge(dev.status) +
    '<span class="page-sub" style="margin:0">' + esc(dev.model) + " · " + esc(dev.location) + " · last seen " + esc(dev.lastSeen) + "</span></div></div></div>" +
    '<div class="page-actions"><a href="devices.html" class="btn btn--sm"><i class="ic i-arrow-left"></i> All devices</a>' +
    '<a href="devices.html#edit-device" class="btn btn--sm"><i class="ic i-edit"></i> Edit</a>' +
    (dev.firmwareNew ? '<button type="button" class="btn btn--sm btn--soft" data-dev-action="firmware"><i class="ic i-upload"></i> Update to ' + esc(dev.firmwareNew) + "</button>" : "") +
    '<button type="button" class="btn btn--sm btn--primary" data-dev-action="restart"><i class="ic i-refresh"></i> Restart</button></div></section>';

  if (dev.status === "weak") html += '<div class="callout callout--warn"><i class="ic i-wifi"></i><span><b>Weak signal (' + dev.signal + "%).</b> Readings may arrive late or be skipped. Move the antenna or add a repeater near " + esc(dev.location) + ".</span></div>";

  html += '<section class="grid grid-4">' +
    tile("i-wifi", dev.status === "online" ? "--green" : "--amber", dev.signal + ' <small class="muted" style="font-size:13px">%</small>', "Signal · " + esc(dev.link), drops ? drops * 15 + " min below 40% in the last 24 h" : "Stable in the last 24 h") +
    tile("i-gauge", "--violet", reporting + ' <small class="muted" style="font-size:13px">/ ' + meters.length + "</small>", "Meters reporting", subs + " sub-meters through them") +
    tile("i-activity", "--cyan", fmt(avail, 1) + ' <small class="muted" style="font-size:13px">%</small>', "Data availability", "readings received · last 24 h") +
    tile("i-clock", "--blue", dev.uptimeDays + ' <small class="muted" style="font-size:13px">days</small>', "Uptime", "since last restart") +
    "</section>";

  html += '<section class="grid grid-main">' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-wifi"></i> Signal strength · last 24 h</h3><p class="card__sub">% · every 15 minutes · hover for values' + (wired ? " · wired connection stays at 100%" : "") + '</p></div></div>' +
    '<div class="card__body"><div class="chart-box" id="chart-signal"></div></div></div>' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-sliders"></i> Network &amp; protocol</h3></div></div><div class="card__body">' +
    kv([["IP address", '<span class="mono">' + esc(dev.ip) + ":" + dev.port + "</span>"], ["MAC", '<span class="mono">' + esc(dev.mac) + "</span>"], ["Connectivity", esc(dev.link)],
      ["Field protocol", esc(dev.fieldProtocol)], ["Uplink", esc(dev.uplink)], ["Polling interval", esc(dev.polling)], ["RS-485 baud rate", dev.baud ? dev.baud : "—"], ["Time sync", "NTP · pool.ntp.org"]]) +
    "</div></div></section>";

  var rows = meters.map(function (x) {
    var m = x.m;
    return '<tr><td><div class="cell-device"><span class="dev-icon" style="--c:var(' + m.color + ')"><i class="ic ' + m.icon + '"></i></span><div><a href="meter.html?id=' + esc(m.id) + '" class="row-link"><strong>' + esc(m.name) + "</strong></a><small>" + esc(m.id) + " · " + esc(m.model) + "</small></div></div></td>" +
      '<td><span class="tag">Slave ID ' + x.slave + "</span></td>" +
      "<td>" + esc(m.location) + "</td>" +
      '<td class="num">' + (m.power < 0 ? "−" : "") + fmt(Math.abs(m.power), 1) + " kW</td>" +
      '<td class="num">' + m.subs.length + "</td>" +
      '<td><span class="badge badge--' + (MSTATUS[m.status] || "info") + '"><span class="dot"></span> ' + esc(m.status) + "</span></td>" +
      '<td class="small muted nowrap">' + (m.status === "Offline" ? "No reply" : "every " + esc(dev.polling)) + "</td>" +
      '<td><div class="actions"><a href="meter.html?id=' + esc(m.id) + '" class="act act--view" title="Open meter dashboard"><i class="ic i-eye"></i></a></div></td></tr>';
  }).join("");
  html += '<section class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-gauge"></i> Connected meters (' + meters.length + ')</h3><p class="card__sub">Meters this device polls · sub-meters report through their parent meter</p></div><a href="meters.html#add-meter" class="btn btn--sm btn--soft"><i class="ic i-plus"></i> Add meter</a></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>Meter</th><th>Address</th><th>Location</th><th class="num">Power now</th><th class="num">Sub-meters</th><th>Status</th><th>Polling</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";

  // Node-RED style view of this device's connections (connections.js fills it)
  html += '<section class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-flow"></i> Connections</h3><p class="card__sub">Meters and sub-meters this device collects from, and where it sends them</p></div>' +
    '<a href="connections.html?focus=' + encodeURIComponent(dev.id) + '" class="btn btn--sm btn--soft"><i class="ic i-edit"></i> Edit connections</a></div>' +
    '<div class="flow" id="flow" data-embed="1" data-focus="' + esc(dev.id) + '"></div></section>';

  html += '<section class="grid grid-2">' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-cpu"></i> Hardware &amp; firmware</h3></div></div><div class="card__body">' +
    kv([["Device ID", '<span class="mono">' + esc(dev.id) + "</span>"], ["Type", esc(dev.type)], ["Make &amp; model", esc(dev.model)], ["Serial number", '<span class="mono">' + esc(dev.serial) + "</span>"],
      ["Firmware", '<span class="mono">' + esc(dev.firmware) + "</span>" + (dev.firmwareNew ? ' <span class="badge badge--blue">' + esc(dev.firmwareNew) + " available</span>" : ' <span class="small muted">up to date</span>')],
      ["Installed at", esc(dev.location) + " · " + esc(dev.site)], ["Installed on", new Date(dev.installed).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })]]) +
    "</div></div>" +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-clock"></i> Event log</h3><p class="card__sub">Recent device events</p></div></div><div class="card__body"><div class="timeline" id="device-events">' +
    ev.map(function (e) { return '<div class="timeline__item" style="--c:var(' + e[2] + ')"><strong>' + esc(e[1]) + "</strong><time>" + new Date(e[0]).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + "</time></div>"; }).join("") +
    "</div></div></div></section>";

  page.innerHTML = html;

  /* ---------- actions (demo: nothing is sent to the device) ---------- */
  page.addEventListener("click", function (e) {
    var b = e.target.closest("[data-dev-action]");
    if (!b) return;
    var a = b.getAttribute("data-dev-action");
    if (a === "restart") {
      if (!window.confirm("Restart " + dev.name + "? Its " + meters.length + " meters stop reporting for about a minute; buffered readings are back-filled.")) return;
      toast("Restart requested", dev.name + " will be back in about a minute.");
      addEvent("Restart requested by admin", "--cyan");
    } else if (a === "firmware") {
      if (!window.confirm("Update " + dev.name + " from " + dev.firmware + " to " + dev.firmwareNew + "? The device restarts after the update.")) return;
      toast("Firmware update started", dev.name + " → " + dev.firmwareNew + ". It restarts when done.");
      addEvent("Firmware update to " + dev.firmwareNew + " started", "--violet");
      b.disabled = true;
    }
  });
  function addEvent(text, c) {
    var list = document.getElementById("device-events");
    var el = document.createElement("div");
    el.className = "timeline__item";
    el.style.setProperty("--c", "var(" + c + ")");
    el.innerHTML = "<strong></strong><time>Just now</time>";
    el.querySelector("strong").textContent = text;
    list.insertBefore(el, list.firstChild);
  }

  /* ---------- signal chart ---------- */
  function draw() {
    var el = document.getElementById("chart-signal");
    var W = Math.max(280, el.clientWidth), Hh = 230, pad = { l: 40, r: 12, t: 24, b: 26 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
    var X = function (x) { return pad.l + iw * (x + 24) / 24; }, Y = function (y) { return pad.t + ih - ih * y / 100; };
    var s = "";
    [0, 25, 50, 75, 100].forEach(function (v) { s += '<line class="grid-line" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="axis-text" x="' + (pad.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + "</text>"; });
    s += '<text class="axis-text" x="' + (pad.l - 8) + '" y="' + (pad.t - 12) + '" text-anchor="end">%</text>';
    for (var h = -24; h <= 0; h += 6) s += '<text class="axis-text" x="' + X(h) + '" y="' + (Hh - 6) + '" text-anchor="middle">' + (h === 0 ? "now" : hhmm(H + h)) + "</text>";
    s += '<line class="grid-line" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + Y(40) + '" y2="' + Y(40) + '" stroke-dasharray="4 4" style="stroke:var(--amber)"/><text class="axis-text" x="' + (W - pad.r) + '" y="' + (Y(40) - 6) + '" text-anchor="end" style="fill:var(--amber)">weak below 40%</text>';
    var d = signal.map(function (p, i) { return (i ? "L" : "M") + X(p.x).toFixed(1) + "," + Y(p.y).toFixed(1); }).join("");
    s += '<path class="series-area" d="' + d + "L" + X(0) + "," + Y(0) + "L" + X(-24) + "," + Y(0) + 'Z"/><path class="series-line" d="' + d + '"/>';
    var last = signal[signal.length - 1];
    s += '<circle class="now-dot" cx="' + X(last.x) + '" cy="' + Y(last.y) + '" r="5"/>';
    s += '<line class="cross" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" visibility="hidden"/><circle class="hover-dot" r="5" visibility="hidden"/><rect x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>';
    el.innerHTML = '<svg width="' + W + '" height="' + Hh + '" role="img" aria-label="' + esc("Signal strength over the last 24 hours, now " + dev.signal + "%") + '">' + s + "</svg>";
    var svg = el.querySelector("svg"), cross = svg.querySelector(".cross"), hd = svg.querySelector(".hover-dot");
    var tip = document.createElement("div"); tip.className = "chart-tip"; tip.hidden = true; el.appendChild(tip);
    svg.lastChild.addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect(), hx = (e.clientX - r.left - pad.l) / iw * 24 - 24;
      var best = signal.reduce(function (a, p) { return Math.abs(p.x - hx) < Math.abs(a.x - hx) ? p : a; }, signal[0]);
      cross.setAttribute("x1", X(best.x)); cross.setAttribute("x2", X(best.x)); cross.setAttribute("visibility", "visible");
      hd.setAttribute("cx", X(best.x)); hd.setAttribute("cy", Y(best.y)); hd.setAttribute("visibility", "visible");
      tip.innerHTML = hhmm(H + best.x) + " · <b>" + best.y + "%</b>" + (best.y < 40 ? " · weak" : "");
      tip.style.left = X(best.x) + "px"; tip.style.top = Y(best.y) + "px"; tip.hidden = false;
    });
    svg.lastChild.addEventListener("mouseleave", function () { tip.hidden = true; cross.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); });
  }
  draw();
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(draw, 150); });
})();
