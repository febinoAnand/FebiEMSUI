/* ==========================================================================
   Energy Dashboard — device Commands, Data publish and Data logs (device.html)
   • Commands: send ping, sync time, polling interval, Modbus register read,
     device info, clear stored readings or restart; each goes Queued → Sent →
     Success / Failed / Timed out and is kept in the Command history with the reply.
   • Data publish: destinations this device's readings are forwarded to — MQTT
     brokers or HTTPS webhooks — with topic/URL, interval, payload format, fields,
     meters and an on/off switch; Test publish and a live payload preview.
   • Data logs: every publish attempt and command reply, with status, duration
     and size; filters, payload view and CSV export.
   Demo mode: nothing reaches a real device. Destinations and commands are kept
   in this browser per organisation and device; past publishes are generated
   steadily. A backend replaces this with /devices/:id/commands,
   /devices/:id/publish-destinations and /devices/:id/data-logs.
   ========================================================================== */
(function () {
  var page = document.getElementById("device-page");
  if (!page) return;
  var id = new URLSearchParams(location.search).get("id") || "GW-01";
  var dev = (window.ED_DEVICES || []).filter(function (d) { return d.id === id; })[0];
  if (!dev) return;
  var sess = window.EDStore && EDStore.session();
  var ORG = sess && sess.status === "ok" ? sess.tenant.id : "ORG";
  var ME = sess && sess.status === "ok" ? EDStore.fullName(sess.user) : "You";
  var meters = dev.meters.map(function (x) {
    var m = (window.ED_METERS || []).filter(function (mm) { return mm.id === x[0]; })[0];
    return m ? { m: m, slave: x[1] } : null;
  }).filter(Boolean);
  var offline = dev.status === "offline", weak = dev.status === "weak" || dev.signal < 40;
  var POLL_S = (function (p) { var m = /([\d.]+)\s*(s|min)/.exec(p || ""); return m ? (+m[1]) * (m[2] === "min" ? 60 : 1) : 15; })(dev.polling);

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fx(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function day(t) { return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  function rnd(key) { var h = 2166136261; for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
  function uid(p) { return p + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function toast(title, text) {
    var t = document.getElementById("device-toast");
    if (!t) return;
    t.querySelector("[data-toast-title]").textContent = title; t.querySelector("[data-toast-text]").textContent = text;
    t.classList.add("is-shown"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("is-shown"); }, 3200);
  }

  /* ---------- per-device store (this browser) ---------- */
  var KEY = "ed-ops-" + ORG + "-" + dev.id, now0 = Date.now();
  var FIELDS = [["kw", "kW"], ["kva", "kVA"], ["pf", "PF"], ["v", "Voltage"], ["i", "Current"], ["hz", "Hz"], ["thd_v", "Voltage THD"], ["thd_i", "Current THD"], ["kwh", "kWh register"]];
  var INTERVALS = [["reading", "Every reading (" + dev.polling + ")"], ["60", "Every 1 min"], ["300", "Every 5 min"], ["900", "Every 15 min"]];
  function seed() {
    return {
      dests: [
        { id: "PD-01", name: "Plant SCADA", type: "mqtt", url: "mqtts://scada.febino.local:8883", topic: "febino/plant1/{device}/{meter}", qos: 1, retain: false,
          interval: "60", format: "flat", fields: ["kw", "pf", "v", "i", "kwh"], meters: [], enabled: true, created: now0 - 40 * 864e5 },
        { id: "PD-02", name: "ERP energy feed", type: "https", url: "https://erp.febino.local/api/energy", method: "POST", auth: "Bearer •••• 7f2a",
          interval: "900", format: "grouped", fields: ["kw", "kwh"], meters: [], enabled: true, created: now0 - 12 * 864e5 },
      ],
      cmds: [
        { id: "CMD-7Q2K", t: now0 - 26 * 36e5, cmd: "sync_time", params: {}, by: "Rahul Verma", status: "success", ms: 412, res: { ok: true, drift_ms: -230 } },
        { id: "CMD-3M9D", t: now0 - 5 * 36e5, cmd: "read_register", params: { slave: meters[0] ? meters[0].slave : 1, fc: "FC03 · holding", address: 3060, count: 4 },
          by: "Mohammed Irfan", status: "success", ms: 268, res: { ok: true, values: [16912, 7340, 16911, 52429] } },
        { id: "CMD-8XW1", t: now0 - 2 * 36e5, cmd: "ping", params: {}, by: "Vijay Kumar", status: offline ? "timeout" : "success", ms: offline ? 10000 : 38, res: offline ? { ok: false, error: "no reply within 10 s" } : { ok: true, rtt_ms: 38 } },
      ],
    };
  }
  var DB;
  try { DB = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { DB = null; }
  if (!DB || !DB.dests || !DB.cmds) DB = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* storage blocked: keep in memory */ } }

  /* ---------- readings used in payloads ---------- */
  function values(x, t) {
    var m = x.m, w = Math.sin(t / 7.2e5 + rnd(m.id) * 6), kw = Math.abs(m.power) * (1 + 0.05 * w), pf = 0.86 + 0.1 * rnd(m.id + "pf");
    var v = 230.5 + (rnd(m.id + "v") - 0.5) * 3 + 1.6 * Math.sin(t / 1.5e6), three = m.phase !== 1;
    var i = three ? kw * 1000 / (3 * v * pf) : kw * 1000 / (v * pf);
    return { kw: +(m.power < 0 ? -kw : kw).toFixed(2), kva: +(kw / pf).toFixed(2), pf: +pf.toFixed(3), v: +v.toFixed(1), i: +i.toFixed(1), hz: +(50 + 0.04 * w).toFixed(2),
      thd_v: +((/MTR-1004/.test(m.id) ? 4.6 : 1.6 + 1.6 * rnd(m.id + "thd")) + 0.35 * Math.sin(t / 9e5 + rnd(m.id + "tw") * 6)).toFixed(1),
      thd_i: +(3 + 4 * rnd(m.id + "t")).toFixed(1), kwh: +(Math.abs(m.energy) * 140 + (t - Date.UTC(2026, 0, 1)) / 36e5 * Math.abs(m.power) * 0.8).toFixed(1) };
  }
  function destMeters(d) { return meters.filter(function (x) { return !d.meters.length || d.meters.indexOf(x.m.id) > -1; }); }
  function topicFor(d, x) { return (d.topic || "").replace(/\{org\}/g, ORG.toLowerCase()).replace(/\{device\}/g, dev.id).replace(/\{meter\}/g, x ? x.m.id : "+"); }
  function payload(d, t) {
    var iso = new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
    function pick(x) { var v = values(x, t), o = {}; d.fields.forEach(function (f) { if (f in v) o[f] = v[f]; }); return o; }
    if (d.format === "grouped") return { device: dev.id, org: ORG, ts: iso, meters: destMeters(d).map(function (x) { return { id: x.m.id, name: x.m.name, values: pick(x) }; }) };
    return destMeters(d).map(function (x) { var o = { device: dev.id, meter: x.m.id, ts: iso }; var p = pick(x); for (var k in p) o[k] = p[k]; return o; });
  }
  function intervalS(d) { return d.interval === "reading" ? POLL_S : +d.interval; }
  function intervalLabel(d) { var f = INTERVALS.filter(function (i) { return i[0] === d.interval; })[0]; return f ? f[1] : d.interval; }

  /* ---------- commands ---------- */
  var CMDS = {
    ping: { label: "Ping", hint: "Check that the device answers and how fast.", params: [] },
    get_info: { label: "Get device info", hint: "Model, serial, firmware, uptime and signal as the device reports them.", params: [] },
    sync_time: { label: "Sync time", hint: "Set the device clock from the server's time (NTP).", params: [] },
    set_polling: { label: "Set polling interval", hint: "How often the device reads its meters. Applies from the next cycle.", params: [{ k: "interval", label: "Interval", type: "select", options: ["15 s", "30 s", "1 min", "5 min"], value: dev.polling }] },
    read_register: { label: "Read Modbus registers", hint: "Read raw values from one meter — for checking a register map. Read only.",
      params: [{ k: "slave", label: "Meter", type: "slave" }, { k: "fc", label: "Function", type: "select", options: ["FC03 · holding", "FC04 · input"] },
        { k: "address", label: "Start address", type: "number", value: 3000, min: 0, max: 65535 }, { k: "count", label: "Registers", type: "number", value: 4, min: 1, max: 32 }] },
    clear_buffer: { label: "Clear stored readings", hint: "Discard readings the device is holding from a time it was offline. They will not be uploaded.", params: [], confirm: "Discard the readings stored on the device? They can't be recovered." },
    restart: { label: "Restart device", hint: "Meters stop reporting for about a minute; buffered readings are uploaded after.", params: [], confirm: "Restart " + dev.name + "? Its meters stop reporting for about a minute." },
  };
  var CST = { queued: ["info", "Queued"], sent: ["blue", "Sent"], success: ["success", "Success"], failed: ["danger", "Failed"], timeout: ["danger", "Timed out"] };
  function paramText(c) {
    var p = c.params || {}, out = [];
    if (p.slave != null) { var x = meters.filter(function (y) { return y.slave === +p.slave; })[0]; out.push("Slave " + p.slave + (x ? " · " + x.m.name : "")); }
    if (p.fc) out.push(p.fc.split(" ")[0]); if (p.address != null) out.push("@" + p.address); if (p.count) out.push("× " + p.count); if (p.interval) out.push(p.interval);
    return out.join(" ") || "—";
  }
  function reply(cmd, p) {
    if (cmd === "ping") return { ok: true, rtt_ms: weak ? 420 + Math.round(Math.random() * 500) : 20 + Math.round(Math.random() * 40) };
    if (cmd === "get_info") return { ok: true, model: dev.model, serial: dev.serial, firmware: dev.firmware, uptime_days: dev.uptimeDays, signal_pct: dev.signal, ip: dev.ip };
    if (cmd === "sync_time") return { ok: true, drift_ms: Math.round((Math.random() - 0.5) * 900), clock: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
    if (cmd === "set_polling") return { ok: true, polling: p.interval, applies: "next cycle" };
    if (cmd === "read_register") { var vals = []; for (var i = 0; i < +p.count; i++) vals.push(Math.round(rnd(dev.id + p.slave + p.address + i) * 65535)); return { ok: true, slave: +p.slave, fc: p.fc.split(" ")[0], address: +p.address, values: vals }; }
    if (cmd === "clear_buffer") return { ok: true, discarded: Math.round(Math.random() * 40) };
    if (cmd === "restart") return { ok: true, message: "Rebooting · back online in about 50 s" };
    return { ok: true };
  }
  function send(cmd, p) {
    var c = { id: uid("CMD"), t: Date.now(), cmd: cmd, params: p, by: ME, status: "queued", ms: null, res: null };
    DB.cmds.unshift(c); DB.cmds = DB.cmds.slice(0, 200); save(); drawCmds(); drawLogs();
    setTimeout(function () { c.status = "sent"; save(); drawCmds(); }, 500);
    var fail = offline || Math.random() < (weak ? 0.12 : 0.02), wait = offline ? 4000 : weak ? 1400 + Math.random() * 1200 : 500 + Math.random() * 500;
    setTimeout(function () {
      c.ms = offline ? 10000 : Math.round(wait);
      if (offline) { c.status = "timeout"; c.res = { ok: false, error: "no reply within 10 s · device is offline" }; }
      else if (fail) { c.status = "failed"; c.res = { ok: false, error: cmd === "read_register" ? "Modbus exception 02 · illegal data address" : "device busy · try again" }; }
      else { c.status = "success"; c.res = reply(cmd, p); }
      save(); drawCmds(); drawLogs();
      toast(CMDS[cmd].label + " · " + CST[c.status][1], c.status === "success" ? "Reply received in " + fx(c.ms) + " ms." : c.res.error);
    }, 500 + wait);
  }

  /* ---------- markup ---------- */
  var cmdOpts = Object.keys(CMDS).map(function (k) { return '<option value="' + k + '">' + CMDS[k].label + "</option>"; }).join("");
  var sCmd = document.createElement("section");
  sCmd.className = "ops-stack";
  sCmd.innerHTML =
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-sliders"></i> Send command</h3><p class="card__sub">To ' + esc(dev.id) + " · " + esc(dev.name) + "</p></div></div>" +
    '<div class="card__body"><form id="ops-cmd-form" novalidate>' +
    (offline ? '<div class="callout callout--danger" style="margin-bottom:14px"><i class="ic i-alert"></i><span>The device is offline — commands will time out until it reconnects.</span></div>' : "") +
    '<div class="ops-cmd-row"><div class="field"><label for="ops-cmd">Command</label><select class="input" id="ops-cmd">' + cmdOpts + "</select></div>" +
    '<div id="ops-cmd-params" class="ops-cmd-params"></div>' +
    '<button type="submit" class="btn btn--primary"><i class="ic i-send"></i> Send command</button></div>' +
    '<p class="hint" id="ops-cmd-hint" style="margin-top:10px"></p></form></div></div>' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-send"></i> Command history</h3><p class="card__sub">Newest first · replies as the device sent them</p></div></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Command</th><th>Parameters</th><th>Sent by</th><th>Status</th><th class="num">Reply in</th><th></th></tr></thead><tbody id="ops-cmd-rows"></tbody></table></div></div>';

  var sPub = document.createElement("section");
  sPub.className = "ops-stack";
  sPub.innerHTML =
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-upload"></i> Publish destinations</h3><p class="card__sub">Where ' + esc(dev.id) + "'s readings are forwarded · MQTT brokers and HTTPS webhooks</p></div>" +
    '<button type="button" class="btn btn--sm btn--primary" id="ops-add-dest"><i class="ic i-plus"></i> Add destination</button></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>Destination</th><th>Endpoint</th><th>Interval</th><th>Format</th><th class="num">Success · 24 h</th><th>Last publish</th><th>On</th><th>Actions</th></tr></thead><tbody id="ops-dest-rows"></tbody></table></div></div>' +
    '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-file"></i> Payload preview</h3><p class="card__sub">The next message, built from the latest readings</p></div></div>' +
    '<div class="card__body"><div class="field"><label for="ops-prev-dest">Destination</label><select class="input" id="ops-prev-dest"></select></div>' +
    '<p class="small muted" id="ops-prev-where" style="margin:10px 0 8px;overflow-wrap:anywhere"></p><pre class="code-block mono" id="ops-prev-json" style="max-height:300px"></pre>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-copy="#ops-prev-json" style="margin-top:10px"><i class="ic i-copy"></i> <span>Copy</span></button></div></div>';

  var sLog = document.createElement("section");
  sLog.className = "card";
  sLog.innerHTML =
    '<div class="card__head"><div><h3 class="card__title"><i class="ic i-clock"></i> Data logs</h3><p class="card__sub">Every publish attempt and command reply for ' + esc(dev.id) + " · newest first</p></div>" +
    '<button type="button" class="btn btn--sm btn--ghost" id="ops-log-export"><i class="ic i-download"></i> Export CSV</button></div>' +
    '<div class="card__body" style="padding-bottom:0"><div class="row wrap" style="gap:10px">' +
    '<label class="search" style="flex:1;min-width:260px;max-width:none"><i class="ic i-search"></i><input type="search" id="ops-log-q" placeholder="Search destination, command or detail…" aria-label="Search data logs" /></label>' +
    '<select class="input" id="ops-log-kind" style="width:auto" aria-label="Type"><option value="">Publishes and commands</option><option value="publish">Publishes</option><option value="command">Commands</option></select>' +
    '<select class="input" id="ops-log-status" style="width:auto" aria-label="Status"><option value="">Any status</option><option value="success">Success</option><option value="retried">Retried</option><option value="failed">Failed</option><option value="pending">In progress</option></select>' +
    '<select class="input" id="ops-log-span" style="width:auto" aria-label="Time range"><option value="3600000" selected>Last 1 hour</option><option value="21600000">Last 6 hours</option><option value="86400000">Last 24 hours</option></select>' +
    '<div class="row wrap" id="ops-log-chips" style="gap:8px;margin-left:auto"></div></div></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Type</th><th>Destination / command</th><th>Detail</th><th>Status</th><th class="num">Duration</th><th class="num">Size</th><th></th></tr></thead><tbody id="ops-log-rows"></tbody></table></div>';

  // after the Telemetry log (tabs pick them up by title)
  var after = document.getElementById("telemetry") || Array.prototype.filter.call(page.querySelectorAll("section.card"), function (s) { return /Connected meters/.test(s.textContent); })[0];
  var ref = after ? after.nextSibling : null;
  [sCmd, sPub, sLog].forEach(function (s) { page.insertBefore(s, ref); });

  /* ---------- Commands UI ---------- */
  var fCmd = $("#ops-cmd"), fParams = $("#ops-cmd-params");
  function drawParams() {
    var c = CMDS[fCmd.value];
    $("#ops-cmd-hint").textContent = c.hint;
    fParams.innerHTML = c.params.map(function (p) {
      var input;
      if (p.type === "select") input = '<select class="input" data-p="' + p.k + '">' + p.options.map(function (o) { return "<option" + (o === p.value ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
      else if (p.type === "slave") input = '<select class="input" data-p="' + p.k + '">' + meters.map(function (x) { return '<option value="' + x.slave + '">Slave ' + x.slave + " · " + esc(x.m.name) + "</option>"; }).join("") + "</select>";
      else input = '<input class="input mono" type="number" data-p="' + p.k + '" value="' + p.value + '" min="' + p.min + '" max="' + p.max + '" />';
      return '<div class="field"><label>' + esc(p.label) + "</label>" + input + "</div>";
    }).join("");
  }
  fCmd.addEventListener("change", drawParams);
  $("#ops-cmd-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var k = fCmd.value, c = CMDS[k], p = {};
    for (var i = 0; i < c.params.length; i++) {
      var d = c.params[i], el = fParams.querySelector('[data-p="' + d.k + '"]'), v = el.value;
      if (d.type === "number") { v = Number(v); if (!isFinite(v) || v < d.min || v > d.max || v % 1) { el.focus(); toast("Check " + d.label.toLowerCase(), "Enter a whole number from " + d.min + " to " + d.max + "."); return; } }
      if (d.type === "slave") v = Number(v);
      p[d.k] = v;
    }
    if (c.confirm && !window.confirm(c.confirm)) return;
    send(k, p);
  });
  function drawCmds() {
    $("#ops-cmd-rows").innerHTML = DB.cmds.length ? DB.cmds.map(function (c) {
      var st = CST[c.status];
      return '<tr><td class="mono nowrap">' + clock(c.t) + '<div class="small muted" style="font-family:var(--font)">' + day(c.t) + "</div></td>" +
        "<td><strong>" + esc(CMDS[c.cmd] ? CMDS[c.cmd].label : c.cmd) + '</strong><div class="small muted mono">' + esc(c.id) + "</div></td>" +
        '<td class="small">' + esc(paramText(c)) + "</td><td>" + esc(c.by) + "</td>" +
        '<td><span class="badge badge--' + st[0] + '"><span class="dot' + (c.status === "queued" || c.status === "sent" ? " dot--live" : "") + '"></span> ' + st[1] + "</span></td>" +
        '<td class="num mono">' + (c.ms == null ? "…" : fx(c.ms) + " ms") + "</td>" +
        "<td>" + (c.res ? '<button type="button" class="btn btn--sm btn--ghost" data-ops-reply="' + c.id + '"><i class="ic i-file"></i> Reply</button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">No commands sent yet.</td></tr>';
  }

  /* ---------- Data publish UI ---------- */
  // steady history of publish attempts for one destination
  function attempts(d, from, to) {
    var out = [], step = intervalS(d) * 1000, fr = d.type === "https" ? 0.04 : 0.006;
    if (weak) fr *= 3; if (offline) fr = 1;
    var startT = Math.max(from, d.created || 0);
    for (var t = Math.floor(to / step) * step; t > startT; t -= step) {
      var r = rnd(d.id + t), st = r < fr ? (rnd(d.id + t + "r") < 0.6 && !offline ? "retried" : "failed") : "success";
      var n = destMeters(d).length || 1, bytes = Math.round((d.format === "grouped" ? 90 : 60) + n * d.fields.length * 14 + rnd(d.id + t + "b") * 20);
      var ms = Math.round((d.type === "https" ? 120 : 35) * (weak ? 3 : 1) + rnd(d.id + t + "m") * (d.type === "https" ? 260 : 60)) + (st === "retried" ? 2000 : 0);
      out.push({ t: t, kind: "publish", d: d, status: st, ms: st === "failed" ? (d.type === "https" ? 10000 : 5000) : ms, bytes: st === "failed" ? 0 : bytes,
        detail: st === "failed" ? (offline ? "device offline · nothing to publish" : d.type === "https" ? "HTTP 503 · gave up after 3 tries" : "broker unreachable · gave up after 3 tries")
          : (st === "retried" ? (d.type === "https" ? "HTTP 200 on retry 2 (first: 503)" : "PUBACK on retry 2") : (d.type === "https" ? "HTTP 200" : "PUBACK · QoS " + d.qos)) + " · " + n + " meter" + (n === 1 ? "" : "s") });
    }
    return out;
  }
  function stats24(d) {
    if (!d.enabled) return null;
    var a = attempts(d, Date.now() - 864e5, Date.now());
    return { ok: a.filter(function (x) { return x.status !== "failed"; }).length, n: a.length, last: a[0] };
  }
  function endpoint(d) { return d.type === "mqtt" ? esc(d.url) + '<div class="small muted mono" style="overflow-wrap:anywhere">' + esc(d.topic) + " · QoS " + d.qos + (d.retain ? " · retain" : "") + "</div>" : esc(d.url) + '<div class="small muted">' + esc(d.method || "POST") + (d.auth ? " · auth header set" : "") + "</div>"; }
  function drawDests() {
    $("#ops-dest-rows").innerHTML = DB.dests.length ? DB.dests.map(function (d) {
      var s = stats24(d), pct = s && s.n ? s.ok / s.n * 100 : null;
      return "<tr><td><strong>" + esc(d.name) + '</strong><div class="small muted">' + (d.type === "mqtt" ? "MQTT broker" : "HTTPS webhook") + " · " + (d.meters.length ? d.meters.length + " of " + meters.length : "all") + " meters</div></td>" +
        '<td class="small" style="white-space:normal;min-width:220px;max-width:300px;overflow-wrap:anywhere">' + endpoint(d) + "</td>" +
        '<td class="small nowrap">' + esc(intervalLabel(d)) + "</td>" +
        '<td class="small">' + (d.format === "grouped" ? "JSON · one message per device" : "JSON · one row per meter") + '<div class="small muted">' + d.fields.length + " fields</div></td>" +
        '<td class="num">' + (pct == null ? '<span class="muted">—</span>' : '<span class="mono" style="color:var(' + (pct >= 99 ? "--green" : pct >= 90 ? "--amber" : "--rose") + ')">' + fx(pct, 1) + '%</span><div class="small muted">' + fx(s.n) + " sent</div>") + "</td>" +
        '<td class="small nowrap">' + (s && s.last ? clock(s.last.t) + '<div class="small muted">' + (s.last.status === "failed" ? "failed" : "OK") + "</div>" : '<span class="muted">' + (d.enabled ? "—" : "paused") + "</span>") + "</td>" +
        '<td><label class="switch" title="' + (d.enabled ? "Publishing" : "Paused") + '"><input type="checkbox" data-ops-toggle="' + d.id + '"' + (d.enabled ? " checked" : "") + ' aria-label="Publish to ' + esc(d.name) + '" /></label></td>' +
        '<td><div class="actions"><button type="button" class="act act--view" data-ops-test="' + d.id + '" title="Test publish" aria-label="Test publish to ' + esc(d.name) + '"><i class="ic i-send"></i></button>' +
        '<button type="button" class="act act--edit" data-ops-edit="' + d.id + '" title="Edit" aria-label="Edit ' + esc(d.name) + '"><i class="ic i-edit"></i></button>' +
        '<button type="button" class="act act--del" data-ops-del="' + d.id + '" title="Delete" aria-label="Delete ' + esc(d.name) + '"><i class="ic i-trash"></i></button></div></td></tr>';
    }).join("") : '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No destinations yet — readings stay in the Energy Dashboard only.</td></tr>';
    var sel = $("#ops-prev-dest"), keep = sel.value;
    sel.innerHTML = DB.dests.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + "</option>"; }).join("") || "<option value=\"\">No destinations</option>";
    if (keep && DB.dests.some(function (d) { return d.id === keep; })) sel.value = keep;
    drawPreview();
  }
  function drawPreview() {
    var d = DB.dests.filter(function (x) { return x.id === $("#ops-prev-dest").value; })[0];
    if (!d) { $("#ops-prev-where").textContent = ""; $("#ops-prev-json").textContent = "Add a destination to see its payload."; return; }
    var t = Math.ceil(Date.now() / (intervalS(d) * 1000)) * intervalS(d) * 1000;
    $("#ops-prev-where").innerHTML = (d.type === "mqtt" ? "Topic <b class=\"mono\">" + esc(d.format === "grouped" ? topicFor(d, null).replace("/+", "") : topicFor(d, destMeters(d)[0])) + "</b>" + (d.format === "grouped" ? "" : " (one per meter)") : esc(d.method || "POST") + " <b class=\"mono\">" + esc(d.url) + "</b>") +
      " · next at " + clock(t) + (d.enabled ? "" : " · <b>paused</b>");
    $("#ops-prev-json").textContent = JSON.stringify(payload(d, t), null, 2);
  }
  $("#ops-prev-dest").addEventListener("change", drawPreview);

  // destination dialog
  var modal = document.createElement("div");
  modal.className = "modal"; modal.id = "ops-dest"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "ops-dest-t");
  modal.innerHTML = '<a href="#close" class="modal__backdrop" aria-label="Close"></a><div class="modal__dialog modal__dialog--lg"><div class="modal__head"><span class="modal__icon modal__icon--cyan"><i class="ic i-upload"></i></span>' +
    '<div><h3 id="ops-dest-t">Add destination</h3><p>Forward ' + esc(dev.id) + "'s readings to another system</p></div><a href=\"#close\" class=\"modal__close\" aria-label=\"Close\"><i class=\"ic i-x\"></i></a></div>" +
    '<form class="modal__body" id="ops-dest-form" novalidate><div class="form-grid form-grid--3">' +
    '<div class="field"><label for="od-name">Name <span class="req">*</span></label><input class="input" id="od-name" maxlength="60" placeholder="e.g. Plant SCADA" /></div>' +
    '<div class="field"><label for="od-type">Type</label><select class="input" id="od-type"><option value="mqtt">MQTT broker</option><option value="https">HTTPS webhook</option></select></div>' +
    '<div class="field"><label for="od-interval">Publish</label><select class="input" id="od-interval">' + INTERVALS.map(function (i) { return '<option value="' + i[0] + '">' + esc(i[1]) + "</option>"; }).join("") + "</select></div>" +
    '<div class="field full"><label for="od-url" id="od-url-l">Broker URL <span class="req">*</span></label><input class="input mono" id="od-url" placeholder="mqtts://broker.example.com:8883" /></div>' +
    '<div class="field full" data-od="mqtt"><label for="od-topic">Topic <span class="req">*</span></label><input class="input mono" id="od-topic" placeholder="febino/{device}/{meter}" /><p class="hint" style="margin-top:6px">Use {org}, {device} and {meter} — e.g. <span class="mono">' + esc(ORG.toLowerCase()) + "/" + esc(dev.id) + "/MTR-1001</span></p></div>" +
    '<div class="field" data-od="mqtt"><label for="od-qos">QoS</label><select class="input" id="od-qos"><option value="0">0 · at most once</option><option value="1" selected>1 · at least once</option><option value="2">2 · exactly once</option></select></div>' +
    '<label class="check" data-od="mqtt" style="align-self:end"><input type="checkbox" id="od-retain" /> Retain last message</label>' +
    '<div class="field" data-od="https"><label for="od-method">Method</label><select class="input" id="od-method"><option>POST</option><option>PUT</option></select></div>' +
    '<div class="field" data-od="https" style="grid-column:span 2"><label for="od-auth">Authorization header</label><input class="input mono" id="od-auth" placeholder="Bearer …  (optional)" autocomplete="off" /></div>' +
    '<div class="field full"><label for="od-format">Payload</label><select class="input" id="od-format"><option value="flat">JSON · one row per meter</option><option value="grouped">JSON · one message per device with all its meters</option></select></div>' +
    '<div class="field full"><label>Fields</label><div class="row wrap" style="gap:14px" id="od-fields">' + FIELDS.map(function (f) { return '<label class="check"><input type="checkbox" value="' + f[0] + '" /> ' + f[1] + "</label>"; }).join("") + "</div></div>" +
    '<div class="field full"><label>Meters</label><div class="row wrap" style="gap:14px" id="od-meters">' + meters.map(function (x) { return '<label class="check"><input type="checkbox" value="' + esc(x.m.id) + '" checked /> ' + esc(x.m.name) + "</label>"; }).join("") + "</div></div>" +
    '<label class="switch full"><input type="checkbox" id="od-enabled" checked /> Publish now</label>' +
    '<p class="hint full" id="od-err" hidden style="color:var(--rose)"></p></div></form>' +
    '<div class="modal__foot"><a href="#close" class="btn btn--ghost">Cancel</a><button type="submit" form="ops-dest-form" class="btn btn--primary" id="od-save"><i class="ic i-check"></i> Add destination</button></div></div>';
  document.body.appendChild(modal);
  var editing = null;
  function syncType() {
    var t = $("#od-type").value;
    $$("[data-od]", modal).forEach(function (el) { el.hidden = el.getAttribute("data-od") !== t; });
    $("#od-url-l").innerHTML = (t === "mqtt" ? "Broker URL" : "Webhook URL") + ' <span class="req">*</span>';
    $("#od-url").placeholder = t === "mqtt" ? "mqtts://broker.example.com:8883" : "https://example.com/api/energy";
  }
  $("#od-type").addEventListener("change", syncType);
  function openDest(d) {
    editing = d ? d.id : null;
    d = d || { name: "", type: "mqtt", url: "", topic: ORG.toLowerCase() + "/{device}/{meter}", qos: 1, retain: false, method: "POST", auth: "", interval: "60", format: "flat", fields: ["kw", "pf", "v", "i", "kwh"], meters: [], enabled: true };
    $("#ops-dest-t").textContent = editing ? "Edit destination" : "Add destination";
    $("#od-save").innerHTML = '<i class="ic i-check"></i> ' + (editing ? "Save destination" : "Add destination");
    $("#od-name").value = d.name; $("#od-type").value = d.type; $("#od-interval").value = d.interval; $("#od-url").value = d.url; $("#od-topic").value = d.topic || "";
    $("#od-qos").value = String(d.qos == null ? 1 : d.qos); $("#od-retain").checked = !!d.retain; $("#od-method").value = d.method || "POST"; $("#od-auth").value = ""; $("#od-auth").placeholder = d.auth ? d.auth + " (leave empty to keep)" : "Bearer …  (optional)";
    $("#od-format").value = d.format; $("#od-enabled").checked = d.enabled;
    $$("#od-fields input", modal).forEach(function (c) { c.checked = d.fields.indexOf(c.value) > -1; });
    $$("#od-meters input", modal).forEach(function (c) { c.checked = !d.meters.length || d.meters.indexOf(c.value) > -1; });
    $("#od-err").hidden = true; syncType();
    location.hash = "#ops-dest";
    setTimeout(function () { $("#od-name").focus(); }, 50);
  }
  $("#ops-add-dest").addEventListener("click", function () { openDest(null); });
  $("#ops-dest-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("#od-type").value, err = "", url = $("#od-url").value.trim(), name = $("#od-name").value.trim(), topic = $("#od-topic").value.trim();
    var fields = $$("#od-fields input:checked", modal).map(function (c) { return c.value; }), ms = $$("#od-meters input:checked", modal).map(function (c) { return c.value; });
    if (!name) err = "Give the destination a name.";
    else if (DB.dests.some(function (d) { return d.id !== editing && d.name.toLowerCase() === name.toLowerCase(); })) err = "Another destination already has this name.";
    else if (t === "mqtt" && !/^mqtts?:\/\/[^\s/]+(:\d{1,5})?\/?$/i.test(url)) err = "Broker URL must look like mqtts://host:8883.";
    else if (t === "https" && !/^https:\/\/[^\s]+$/i.test(url)) err = "Webhook URL must start with https://.";
    else if (t === "mqtt" && !topic) err = "Enter a topic.";
    else if (t === "mqtt" && /[#+]/.test(topic)) err = "A publish topic can't contain + or #.";
    else if (!fields.length) err = "Pick at least one field.";
    else if (!ms.length) err = "Pick at least one meter.";
    if (err) { $("#od-err").textContent = err; $("#od-err").hidden = false; return; }
    var old = DB.dests.filter(function (d) { return d.id === editing; })[0];
    var authIn = $("#od-auth").value.trim();
    var d = { id: editing || uid("PD"), name: name, type: t, url: url, topic: t === "mqtt" ? topic : "", qos: +$("#od-qos").value, retain: $("#od-retain").checked,
      method: $("#od-method").value, auth: t === "https" ? (authIn ? authIn.split(" ")[0] + " •••• " + authIn.slice(-4) : old ? old.auth : "") : "",
      interval: $("#od-interval").value, format: $("#od-format").value, fields: fields, meters: ms.length === meters.length ? [] : ms, enabled: $("#od-enabled").checked,
      created: old ? old.created : Date.now() };
    if (old) DB.dests[DB.dests.indexOf(old)] = d; else DB.dests.push(d);
    save(); drawDests(); drawLogs();
    location.hash = "#close";
    toast(old ? "Destination saved" : "Destination added", d.enabled ? d.name + " · publishing " + intervalLabel(d).toLowerCase() + "." : d.name + " · paused.");
  });
  sPub.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-ops-edit]"))) openDest(DB.dests.filter(function (d) { return d.id === b.getAttribute("data-ops-edit"); })[0]);
    else if ((b = e.target.closest("[data-ops-del]"))) {
      var d = DB.dests.filter(function (x) { return x.id === b.getAttribute("data-ops-del"); })[0];
      if (!d || !window.confirm("Delete " + d.name + "? " + dev.id + " stops publishing to it.")) return;
      DB.dests = DB.dests.filter(function (x) { return x !== d; }); save(); drawDests(); drawLogs(); toast("Destination deleted", d.name);
    } else if ((b = e.target.closest("[data-ops-test]"))) testPublish(DB.dests.filter(function (d) { return d.id === b.getAttribute("data-ops-test"); })[0]);
  });
  sPub.addEventListener("change", function (e) {
    var c = e.target.closest("[data-ops-toggle]"); if (!c) return;
    var d = DB.dests.filter(function (x) { return x.id === c.getAttribute("data-ops-toggle"); })[0];
    d.enabled = c.checked; if (d.enabled) d.created = Math.max(d.created || 0, Date.now() - 1); save(); drawDests(); drawLogs();
    toast(d.enabled ? "Publishing resumed" : "Publishing paused", d.name);
  });
  DB.tests = DB.tests || [];
  function testPublish(d) {
    if (!d) return;
    var fail = offline || Math.random() < (d.type === "https" ? 0.05 : 0.01), t = Date.now(), body = payload(d, t);
    var entry = { t: t, kind: "publish", test: true, did: d.id, name: d.name, status: fail ? "failed" : "success", ms: fail ? 5000 : Math.round(80 + Math.random() * 220),
      bytes: fail ? 0 : JSON.stringify(body).length, detail: (fail ? (offline ? "device offline" : d.type === "https" ? "HTTP 503 · service unavailable" : "broker unreachable") : d.type === "https" ? "HTTP 200" : "PUBACK · QoS " + d.qos) + " · test message", body: body };
    DB.tests.unshift(entry); DB.tests = DB.tests.slice(0, 50); save(); drawLogs();
    toast("Test publish " + (fail ? "failed" : "sent"), d.name + (fail ? " · " + entry.detail : " · " + fx(entry.ms) + " ms"));
  }

  /* ---------- Data logs ---------- */
  var lKind = $("#ops-log-kind"), lStatus = $("#ops-log-status"), lSpan = $("#ops-log-span"), lQ = $("#ops-log-q"), shown = [];
  var LST = { success: ["success", "Success"], retried: ["warn", "Retried"], failed: ["danger", "Failed"], pending: ["info", "In progress"] };
  function logRows() {
    var to = Date.now(), from = to - +lSpan.value, rows = [];
    DB.dests.forEach(function (d) { if (d.enabled) attempts(d, from, to).forEach(function (a) { rows.push(a); }); });
    DB.tests.forEach(function (x) { if (x.t > from) rows.push({ t: x.t, kind: "publish", name: x.name + " (test)", status: x.status, ms: x.ms, bytes: x.bytes, detail: x.detail, body: x.body }); });
    DB.cmds.forEach(function (c) {
      if (c.t <= from) return;
      var st = c.status === "success" ? "success" : c.status === "queued" || c.status === "sent" ? "pending" : "failed";
      rows.push({ t: c.t, kind: "command", name: CMDS[c.cmd] ? CMDS[c.cmd].label : c.cmd, status: st, ms: c.ms, bytes: c.res ? JSON.stringify(c.res).length : null,
        detail: paramText(c) + " · by " + c.by + (c.res && c.res.error ? " · " + c.res.error : ""), body: c.res, cmd: c });
    });
    return rows.sort(function (a, b) { return b.t - a.t; });
  }
  var all = [];
  function drawLogs() {
    all = logRows();
    var k = lKind.value, s = lStatus.value, q = lQ.value.trim().toLowerCase();
    shown = all.filter(function (r) {
      var nm = r.name || (r.d && r.d.name) || "";
      return (!k || r.kind === k) && (!s || r.status === s) && (!q || (nm + " " + r.detail).toLowerCase().indexOf(q) > -1);
    });
    $("#ops-log-rows").innerHTML = shown.length ? shown.map(function (r, i) {
      var st = LST[r.status], nm = r.name || r.d.name;
      return '<tr><td class="mono nowrap">' + clock(r.t) + '<div class="small muted" style="font-family:var(--font)">' + day(r.t) + "</div></td>" +
        '<td><span class="tag">' + (r.kind === "publish" ? '<i class="ic i-upload"></i> Publish' : '<i class="ic i-send"></i> Command') + "</span></td>" +
        "<td><strong>" + esc(nm) + "</strong>" + (r.d ? '<div class="small muted">' + (r.d.type === "mqtt" ? "MQTT" : "HTTPS") + "</div>" : "") + "</td>" +
        '<td class="small" style="white-space:normal;min-width:200px;max-width:340px">' + esc(r.detail) + "</td>" +
        '<td><span class="badge badge--' + st[0] + '"><span class="dot"></span> ' + st[1] + "</span></td>" +
        '<td class="num mono">' + (r.ms == null ? "…" : fx(r.ms) + " ms") + "</td>" +
        '<td class="num mono">' + (r.bytes ? fx(r.bytes) + " B" : "—") + "</td>" +
        '<td><button type="button" class="btn btn--sm btn--ghost" data-ops-log="' + i + '"><i class="ic i-file"></i> View</button></td></tr>';
    }).join("") : '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No log entries match these filters.</td></tr>';
    var pubs = shown.filter(function (r) { return r.kind === "publish"; }), bad = shown.filter(function (r) { return r.status === "failed"; }).length;
    $("#ops-log-chips").innerHTML = '<span class="tag">' + fx(shown.length) + " entries</span>" +
      '<span class="tag" style="color:var(--green)">' + (pubs.length ? fx(pubs.filter(function (r) { return r.status !== "failed"; }).length / pubs.length * 100, 1) : "—") + "% delivered</span>" +
      '<span class="tag"' + (bad ? ' style="color:var(--rose)"' : "") + ">" + bad + " failed</span>";
  }
  [lKind, lStatus, lSpan].forEach(function (el) { el.addEventListener("change", drawLogs); });
  lQ.addEventListener("input", drawLogs);

  // detail dialog: reuse the telemetry "Raw message" dialog
  function showRaw(title, meta, obj) {
    var M = document.getElementById("telemetry-raw"); if (!M) return;
    $("#telemetry-raw-t", M).textContent = title; $("#tr-sub", M).textContent = meta.sub; $("#tr-meta", M).innerHTML = meta.html;
    $("#tr-json", M).textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    location.hash = "#telemetry-raw";
  }
  sLog.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ops-log]"); if (!b) return;
    var r = shown[+b.getAttribute("data-ops-log")], st = LST[r.status], nm = r.name || r.d.name;
    if (r.kind === "command") return showRaw("Command reply", { sub: nm + " · " + new Date(r.t).toLocaleString(), html: '<span class="badge badge--' + st[0] + '"><span class="dot"></span> ' + st[1] + '</span> <span class="tag">' + esc(r.cmd.id) + "</span>" }, r.body || { status: "waiting for the device" });
    var body = r.body || payload(r.d, r.t);
    showRaw("Published message", { sub: nm + " · " + new Date(r.t).toLocaleString(),
      html: '<span class="badge badge--' + st[0] + '"><span class="dot"></span> ' + st[1] + '</span> <span class="tag">' + esc(r.detail) + "</span>" + (r.d ? ' <span class="tag mono">' + esc(r.d.type === "mqtt" ? topicFor(r.d, destMeters(r.d)[0]) : r.d.url) + "</span>" : "") +
        (r.status === "failed" ? '<p class="hint" style="margin-top:8px;color:var(--rose)">Not delivered — this is the message that was attempted.</p>' : "") }, body);
  });
  $("#ops-cmd-rows").parentNode.parentNode.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ops-reply]"); if (!b) return;
    var c = DB.cmds.filter(function (x) { return x.id === b.getAttribute("data-ops-reply"); })[0], st = CST[c.status];
    showRaw("Command reply", { sub: (CMDS[c.cmd] ? CMDS[c.cmd].label : c.cmd) + " · " + new Date(c.t).toLocaleString(), html: '<span class="badge badge--' + st[0] + '"><span class="dot"></span> ' + st[1] + '</span> <span class="tag">' + esc(c.id) + '</span> <span class="tag">' + esc(paramText(c)) + "</span>" }, c.res);
  });
  $("#ops-log-export").addEventListener("click", function () {
    var lines = [["Time", "Type", "Destination / command", "Detail", "Status", "Duration (ms)", "Size (bytes)"].join(",")];
    shown.forEach(function (r) { lines.push([new Date(r.t).toISOString(), r.kind, '"' + (r.name || r.d.name).replace(/"/g, '""') + '"', '"' + r.detail.replace(/"/g, '""') + '"', LST[r.status][1], r.ms == null ? "" : r.ms, r.bytes || ""].join(",")); });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = dev.id + "-data-logs.csv"; document.body.appendChild(a); a.click(); a.remove();
  });

  drawParams(); drawCmds(); drawDests(); drawLogs();
  // new publishes appear as their interval comes round; the preview follows the readings
  setInterval(function () { drawLogs(); drawPreview(); }, 15000);
})();
