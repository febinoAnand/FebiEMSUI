/* ==========================================================================
   Energy Dashboard — telemetry messages (shared by device.html and devices.html)
   EDTelemetry.forDevice(device) gives that device's meters, polling interval,
   source and a steady message(meter, time) generator, so the per-device
   Telemetry log and the all-devices Telemetry logs always show the same data.
   Status: OK, Late, Timeout (the meter did not answer), CRC error (corrupt
   frame, discarded) or Out of range (a value outside sane limits, flagged).
   Each meter reports only the fields of its class (ED_METER_CLASSES in
   meter-data.js): basic kWh, multifunction, power quality, DC or DG controller.
   A backend replaces this with GET /devices/:id/telemetry (and /telemetry for
   all devices) plus the WebSocket 'reading' event.
   ========================================================================== */
(function () {
  // steady pseudo-random number in [0,1) for a key
  function rnd(key) { var h = 2166136261; for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
  var EPOCH = Date.UTC(2026, 0, 1);
  var STATUS = {
    ok: ["success", "OK"], late: ["warn", "Late"], timeout: ["danger", "Timeout"], crc: ["danger", "CRC error"], range: ["violet", "Out of range"],
  };
  // every field a meter can report; a meter class picks the ones it has
  var FIELDS = [
    { k: "kw", label: "Power", col: "kW", unit: "kW", d: 1, zero: true },
    { k: "v", label: "Voltage", col: "Voltage", unit: "V", d: 1 },
    { k: "i", label: "Current", col: "Current", unit: "A", d: 1, zero: true },
    { k: "pf", label: "Power factor", col: "PF", unit: "", d: 2 },
    { k: "hz", label: "Frequency", col: "Hz", unit: "Hz", d: 2 },
    { k: "thdv", label: "Voltage THD", col: "V-THD", unit: "%", d: 1, zero: true },
    { k: "thdi", label: "Current THD", col: "I-THD", unit: "%", d: 1, zero: true },
    { k: "fuel", label: "Fuel level", col: "Fuel", unit: "%", d: 0, zero: true },
    { k: "rh", label: "Run hours", col: "Run hours", unit: "h", d: 1, chart: false },
    { k: "kwh", label: "kWh register", col: "kWh register", unit: "kWh", d: 1, chart: false },
  ];
  function classOf(m) { var C = window.ED_METER_CLASSES || {}; return C[m.mclass] || C.multi || { label: "Multifunction meter", fields: ["kw", "v", "i", "pf", "hz", "kwh"] }; }
  // fields reported by any of these meters, in display order
  function fieldsFor(xs) { var has = {}; xs.forEach(function (x) { x.cls.fields.forEach(function (k) { has[k] = 1; }); }); return FIELDS.filter(function (f) { return has[f.k]; }); }
  function fmtN(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  // one table cell for field f of message r: value, "—" when lost, "n/a" when this meter class has no such field
  function cell(r, f) {
    if (r.x.cls.fields.indexOf(f.k) < 0) return '<td class="num muted" title="' + r.x.cls.label + ' · not measured">n/a</td>';
    var bad = r.status === "timeout" || r.status === "crc";
    if (bad || r[f.k] == null) return '<td class="num mono">—</td>';
    var style = (f.k === "v" && r.status === "range") ? ' style="color:var(--rose)"' : ((f.k === "thdv" || f.k === "thdi") && r[f.k] > (f.k === "thdv" ? 5 : 8)) ? ' style="color:var(--amber)"' : (f.k === "fuel" && r.fuel < 25) ? ' style="color:var(--rose)"' : "";
    return '<td class="num mono"' + style + ">" + fmtN(r[f.k], f.d) + (f.k === "v" || f.k === "i" || f.k === "hz" || f.k === "thdv" || f.k === "thdi" || f.k === "fuel" ? " " + f.unit : "") + "</td>";
  }

  function org() { var s = window.EDStore && EDStore.session && EDStore.session(); return s && s.status === "ok" ? s.tenant.id : "ORG"; }

  function forDevice(dev) {
    var meters = dev.meters.map(function (x) {
      var m = (window.ED_METERS || []).filter(function (mm) { return mm.id === x[0]; })[0];
      return m ? { m: m, slave: x[1], dev: dev, cls: classOf(m) } : null;
    }).filter(Boolean);
    var POLL = (function (p) { var m = /([\d.]+)\s*(s|min)/.exec(p || ""); return m ? (+m[1]) * (m[2] === "min" ? 60 : 1) * 1000 : 15000; })(dev.polling);
    var SOURCE = /MQTT/i.test(dev.uplink) ? "MQTT · ed/" + org() + "/" + dev.id + "/readings"
      : /HTTPS/i.test(dev.uplink) ? "HTTPS · POST /ingest/v1/readings" : "Modbus TCP poll · " + dev.ip + ":" + dev.port;
    var weak = dev.status === "weak" || dev.signal < 40, offline = dev.status === "offline";

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
      // extra fields some classes report
      row.thdi = (/MTR-1004/.test(m.id) ? 9.2 : 4 + 3 * rnd(m.id + "thi")) + 0.8 * Math.sin(t / 8e5 + rnd(m.id + "ti") * 6) + 0.3 * (rnd(k + "ti") - 0.5);
      row.fuel = Math.max(5, 78 - ((t - EPOCH) / 36e5 % 96) * 0.7 * (kw > 0 ? 1 : 0.2) + 2 * rnd(m.id + "fu"));
      row.rh = 1840 + (t - EPOCH) / 36e5 * 0.12;
      if (x.cls.dc) { row.v = 612 + 18 * Math.sin(t / 1.1e6) + 2 * (rnd(k + "v") - 0.5); row.i = kw * 1000 / row.v; row.three = false; }
      // keep only what this meter class measures
      ["v", "i", "pf", "hz", "thdv", "thdi", "fuel", "rh", "kwh"].forEach(function (f) { if (x.cls.fields.indexOf(f) < 0) row[f] = null; });
      return row;
    }

    function history(spanMs, end) {
      var out = [], start = Math.floor((end - spanMs) / POLL) * POLL;
      for (var t = Math.floor(end / POLL) * POLL; t > start; t -= POLL) meters.forEach(function (x) { out.push(message(x, t)); });
      return out;
    }

    // the message as the device sent it
    function envelope(r) {
      var iso = new Date(r.t).toISOString().replace(/\.\d+Z$/, "Z"), body;
      if (r.status === "timeout") body = { ts: iso, slave: r.x.slave, error: "timeout", detail: "no reply within 1000 ms" };
      else if (r.status === "crc") body = { ts: iso, slave: r.x.slave, error: "crc", detail: "frame checksum mismatch · discarded" };
      else {
        // only the fields this meter class reports
        body = { ts: iso, slave: r.x.slave, kw: +r.kw.toFixed(2) };
        if (r.v != null) body.v = r.three ? [r.v, r.v * 0.993, r.v * 1.004].map(function (n) { return +n.toFixed(1); }) : [+r.v.toFixed(1)];
        if (r.i != null) body.i = r.three ? [r.i, r.i * 0.95, r.i * 0.92].map(function (n) { return +n.toFixed(1); }) : [+r.i.toFixed(1)];
        if (r.pf != null) body.pf = +r.pf.toFixed(3);
        if (r.hz != null) body.hz = +r.hz.toFixed(2);
        if (r.thdv != null) body.thd_v = +r.thdv.toFixed(1);
        if (r.thdi != null) body.thd_i = +r.thdi.toFixed(1);
        if (r.fuel != null) body.fuel_pct = +r.fuel.toFixed(0);
        if (r.rh != null) body.run_hours = +r.rh.toFixed(1);
        if (r.kwh != null) body.kwh_imp = +r.kwh.toFixed(1);
      }
      return { device: dev.id, seq: Math.floor(r.t / POLL) % 1000000, readings: [body] };
    }

    return { dev: dev, meters: meters, POLL: POLL, SOURCE: SOURCE, message: message, history: history, envelope: envelope };
  }

  window.EDTelemetry = { forDevice: forDevice, STATUS: STATUS, FIELDS: FIELDS, fieldsFor: fieldsFor, cell: cell, classOf: classOf };
})();
