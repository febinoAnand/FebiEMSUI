/* ==========================================================================
   Energy Dashboard — telemetry logs for all devices (devices.html)
   Every message received from every device, newest first: device, meter,
   the readings its meter class reports (columns follow the meters in view), kWh register, latency and status (OK, Late, Timeout, CRC error,
   Out of range). Filters by device, meter, status and time range; new
   messages arrive live at each device's polling interval (pause with Live);
   "Raw" shows the payload as the device sent it; Export CSV saves the view.
   Messages come from telemetry-core.js, so they match each device's own
   Telemetry tab. A backend replaces history() with GET /telemetry and live
   updates with the WebSocket 'reading' event.
   ========================================================================== */
(function () {
  var host = Array.prototype.filter.call(document.querySelectorAll("main section.card"), function (s) {
    var t = s.querySelector(".card__title"); return t && /^\s*Devices\s*$/.test(t.textContent);
  })[0];
  if (!host || !window.EDTelemetry) return;
  var DEVS = (window.ED_DEVICES || []).map(EDTelemetry.forDevice).filter(function (T) { return T.meters.length; });
  if (!DEVS.length) return;
  var STATUS = EDTelemetry.STATUS, PAGE = 100;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fx(n, d) { return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function key(r) { return r.x.dev.id + "-" + r.t + "-" + r.x.slave; }

  /* ---------- markup ---------- */
  var sec = document.createElement("section");
  sec.className = "card"; sec.id = "telemetry-logs";
  sec.innerHTML =
    '<div class="card__head"><div><h3 class="card__title"><i class="ic i-activity"></i> Telemetry logs</h3>' +
    '<p class="card__sub">Every message received from all ' + DEVS.length + " devices · each at its own polling interval · newest first</p></div>" +
    '<div class="row wrap" style="gap:8px"><label class="switch" title="Add new messages as they arrive"><input type="checkbox" id="tla-live" checked /> Live</label>' +
    '<button type="button" class="btn btn--sm btn--ghost" id="tla-export"><i class="ic i-download"></i> Export CSV</button></div></div>' +
    '<div class="card__body" style="padding-bottom:0"><div class="row wrap" style="gap:10px">' +
    '<select class="input" id="tla-dev" style="width:auto" aria-label="Device"><option value="">All devices</option>' +
    DEVS.map(function (T) { return '<option value="' + esc(T.dev.id) + '">' + esc(T.dev.id + " · " + T.dev.name) + "</option>"; }).join("") + "</select>" +
    '<select class="input" id="tla-meter" style="width:auto" aria-label="Meter"></select>' +
    '<select class="input" id="tla-status" style="width:auto" aria-label="Status"><option value="">Any status</option><option value="problem">Problems only</option><option value="ok">OK</option><option value="late">Late</option><option value="timeout">Timeout</option><option value="crc">CRC error</option><option value="range">Out of range</option></select>' +
    '<select class="input" id="tla-span" style="width:auto" aria-label="Time range"><option value="900000" selected>Last 15 min</option><option value="3600000">Last 1 hour</option><option value="21600000">Last 6 hours</option></select>' +
    '<div class="row wrap" id="tla-chips" style="gap:8px;margin-left:auto"></div></div></div>' +
    '<div class="table-wrap"><table class="table"><thead id="tla-head"></thead>' +
    '<tbody id="tla-rows"></tbody></table></div>' +
    '<div class="card__body" style="padding-top:12px;text-align:center"><span class="small muted" id="tla-count"></span> <button type="button" class="btn btn--sm btn--soft" id="tla-more" hidden>Show more</button></div>';
  host.insertAdjacentElement("afterend", sec);

  // raw payload dialog (same layout as on a device page)
  if (!document.getElementById("telemetry-raw")) {
    var md = document.createElement("div");
    md.className = "modal"; md.id = "telemetry-raw"; md.setAttribute("role", "dialog"); md.setAttribute("aria-modal", "true"); md.setAttribute("aria-labelledby", "telemetry-raw-t");
    md.innerHTML = '<a href="#close" class="modal__backdrop" aria-label="Close"></a><div class="modal__dialog"><div class="modal__head">' +
      '<span class="modal__icon modal__icon--cyan"><i class="ic i-file"></i></span><div><h3 id="telemetry-raw-t">Raw message</h3><p id="tr-sub"></p></div>' +
      '<a href="#close" class="modal__close" aria-label="Close"><i class="ic i-x"></i></a></div>' +
      '<div class="modal__body"><div id="tr-meta" class="row wrap" style="gap:8px;margin-bottom:12px"></div><pre class="code-block mono" id="tr-json"></pre></div>' +
      '<div class="modal__foot"><a href="#close" class="btn btn--ghost">Close</a><button type="button" class="btn btn--primary" data-copy="#tr-json"><i class="ic i-copy"></i> <span>Copy JSON</span></button></div></div>';
    document.body.appendChild(md);
  }

  var fDev = $("#tla-dev"), fMeter = $("#tla-meter"), fStatus = $("#tla-status"), fSpan = $("#tla-span"), live = $("#tla-live"), tbody = $("#tla-rows");
  var all = [], view = [], fresh = {}, shown = PAGE;

  function meterOptions() {
    var keep = fMeter.value;
    var list = DEVS.filter(function (T) { return !fDev.value || T.dev.id === fDev.value; });
    fMeter.innerHTML = '<option value="">All meters</option>' + list.map(function (T) {
      return T.meters.map(function (x) { return '<option value="' + esc(x.m.id) + '">' + esc(x.m.name + " · " + x.m.id) + "</option>"; }).join("");
    }).join("");
    if (Array.prototype.some.call(fMeter.options, function (o) { return o.value === keep; })) fMeter.value = keep;
  }

  function cells(r) {
    var x = r.x, s = STATUS[r.status], d = new Date(r.t), bad = r.status === "timeout" || r.status === "crc", k = key(r);
    return '<tr' + (fresh[k] ? ' class="is-new"' : "") + '><td class="mono nowrap">' + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      '<div class="small muted" style="font-family:var(--font)">' + d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + "</div></td>" +
      '<td><a href="device.html?id=' + encodeURIComponent(x.dev.id) + '#telemetry" class="device-chip">' + esc(x.dev.id) + '</a><div class="small muted">every ' + esc(x.dev.polling) + "</div></td>" +
      '<td><a href="meter.html?id=' + encodeURIComponent(x.m.id) + '"><strong>' + esc(x.m.name) + '</strong></a><div class="small muted">Slave ' + x.slave + " · " + esc(x.m.id) + " · " + (x.m.phase === 1 ? "1φ" : "3φ") + " · " + esc(x.cls.label) + "</div></td>" +
      F.map(function (f) { return EDTelemetry.cell(r, f); }).join("") +
      '<td class="num mono">' + (r.status === "timeout" ? "> 1,000 ms" : fx(r.latency, 0) + " ms") + "</td>" +
      '<td><span class="badge badge--' + s[0] + '"><span class="dot"></span> ' + s[1] + "</span></td>" +
      '<td><button type="button" class="btn btn--sm btn--ghost" data-raw-all="' + k + '"><i class="ic i-file"></i> Raw</button></td></tr>';
  }

  function chips() {
    var n = view.length, ok = view.filter(function (r) { return r.status === "ok"; }).length;
    var errs = view.filter(function (r) { return r.status === "timeout" || r.status === "crc"; }).length;
    var lat = view.filter(function (r) { return r.status !== "timeout"; });
    var avg = lat.length ? lat.reduce(function (a, r) { return a + r.latency; }, 0) / lat.length : 0;
    $("#tla-chips").innerHTML = '<span class="tag">' + fx(n, 0) + " messages</span>" +
      '<span class="tag" style="color:var(--green)">' + (n ? fx(ok / n * 100, 1) : "0") + "% OK</span>" +
      '<span class="tag"' + (errs ? ' style="color:var(--rose)"' : "") + ">" + errs + " lost</span>" +
      '<span class="tag">avg ' + fx(avg, 0) + " ms</span>";
  }

  // columns = fields reported by the meters in view (each meter class has its own set)
  var F = [];
  function head() {
    var xs = [];
    DEVS.forEach(function (T) { if (!fDev.value || T.dev.id === fDev.value) T.meters.forEach(function (x) { if (!fMeter.value || x.m.id === fMeter.value) xs.push(x); }); });
    F = EDTelemetry.fieldsFor(xs);
    $("#tla-head").innerHTML = "<tr><th>Time</th><th>Device</th><th>Meter</th>" + F.map(function (f) { return '<th class="num">' + esc(f.col) + "</th>"; }).join("") + '<th class="num">Latency</th><th>Status</th><th></th></tr>';
  }
  function render() {
    head();
    var dv = fDev.value, mt = fMeter.value, st = fStatus.value;
    view = all.filter(function (r) {
      return (!dv || r.x.dev.id === dv) && (!mt || r.x.m.id === mt) && (!st || (st === "problem" ? r.status !== "ok" : r.status === st));
    });
    var page = view.slice(0, shown);
    tbody.innerHTML = page.length ? page.map(cells).join("") : '<tr><td colspan="' + (F.length + 6) + '" class="muted" style="text-align:center;padding:28px">No messages match these filters.</td></tr>';
    $("#tla-count").textContent = view.length ? "Showing " + fx(page.length, 0) + " of " + fx(view.length, 0) : "";
    $("#tla-more").hidden = page.length >= view.length;
    chips();
  }

  function load() {
    var span = +fSpan.value, now = Date.now();
    all = [];
    DEVS.forEach(function (T) { all = all.concat(T.history(span, now)); });
    all.sort(function (a, b) { return b.t - a.t || (a.x.dev.id < b.x.dev.id ? -1 : 1) || a.x.slave - b.x.slave; });
    fresh = {}; shown = PAGE; render();
  }

  // Live: each device adds its new polling cycles
  var lastCycle = {};
  DEVS.forEach(function (T) { lastCycle[T.dev.id] = Math.floor(Date.now() / T.POLL) * T.POLL; });
  setInterval(function () {
    if (!live.checked) return;
    var now = Date.now(), added = [];
    DEVS.forEach(function (T) {
      var cyc = Math.floor(now / T.POLL) * T.POLL;
      for (var t = lastCycle[T.dev.id] + T.POLL; t <= cyc; t += T.POLL) T.meters.forEach(function (x) { added.push(T.message(x, t)); });
      lastCycle[T.dev.id] = Math.max(lastCycle[T.dev.id], cyc);
    });
    if (!added.length) return;
    fresh = {};
    added.forEach(function (r) { fresh[key(r)] = 1; });
    var cutoff = now - +fSpan.value;
    all = added.concat(all).filter(function (r) { return r.t > cutoff; });
    all.sort(function (a, b) { return b.t - a.t || (a.x.dev.id < b.x.dev.id ? -1 : 1) || a.x.slave - b.x.slave; });
    render();
  }, 5000);

  function raw(k) {
    var r = all.filter(function (x) { return key(x) === k; })[0];
    if (!r) return;
    var T = DEVS.filter(function (d) { return d.dev === r.x.dev; })[0], M = $("#telemetry-raw");
    $("#telemetry-raw-t", M).textContent = "Raw message";
    $("#tr-sub", M).textContent = r.x.dev.id + " · " + r.x.m.name + " · slave " + r.x.slave + " · " + new Date(r.t).toLocaleString();
    $("#tr-meta", M).innerHTML = '<span class="badge badge--' + STATUS[r.status][0] + '"><span class="dot"></span> ' + STATUS[r.status][1] + '</span> <span class="tag">' + esc(T.SOURCE) +
      '</span> <span class="tag">received ' + (r.status === "timeout" ? "—" : "after " + fx(r.latency, 0) + " ms") + "</span>" +
      (r.status === "range" ? '<p class="hint" style="margin-top:8px;color:var(--rose)">Voltage is above 1.25 × nominal — the value is stored but flagged and left out of alerts.</p>' : "") +
      (r.status === "late" ? '<p class="hint" style="margin-top:8px">Arrived more than 5 s after it was read — stored with its original time.</p>' : "");
    $("#tr-json", M).textContent = JSON.stringify(T.envelope(r), null, 2);
    location.hash = "#telemetry-raw";
  }

  function exportCsv() {
    // columns = fields of the meters in view; blank where a meter class has no such field or the message was lost
    var lines = [["Time", "Device", "Meter ID", "Meter", "Meter class", "Slave", "Phase"].concat(F.map(function (f) { return f.label + (f.unit ? " (" + f.unit + ")" : ""); }), ["Latency (ms)", "Status"]).join(",")];
    view.forEach(function (r) {
      var bad = r.status === "timeout" || r.status === "crc";
      lines.push([new Date(r.t).toISOString(), r.x.dev.id, r.x.m.id, '"' + r.x.m.name.replace(/"/g, '""') + '"', '"' + r.x.cls.label + '"', r.x.slave, r.x.m.phase === 1 ? "1" : "3"]
        .concat(F.map(function (f) { return bad || r[f.k] == null ? "" : r[f.k].toFixed(Math.max(f.d, f.k === "kw" ? 2 : f.d)); }), [r.status === "timeout" ? "" : r.latency, STATUS[r.status][1]]).join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = "telemetry-logs.csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  fDev.addEventListener("change", function () { meterOptions(); shown = PAGE; render(); });
  [fMeter, fStatus].forEach(function (el) { el.addEventListener("change", function () { shown = PAGE; render(); }); });
  fSpan.addEventListener("change", load);
  $("#tla-more").addEventListener("click", function () { shown += PAGE; render(); });
  $("#tla-export").addEventListener("click", exportCsv);
  tbody.addEventListener("click", function (e) { var b = e.target.closest("[data-raw-all]"); if (b) raw(b.getAttribute("data-raw-all")); });

  meterOptions();
  load();
})();
