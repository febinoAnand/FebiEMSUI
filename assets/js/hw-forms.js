/* ==========================================================================
   Energy Dashboard — device & meter forms driven by the hardware catalogue
   Make & model is picked from ED_HW (hw-catalog.js). Choosing a device fills
   its type, field protocol, uplink and default port and shows its interfaces;
   choosing a meter fills its meter class, register map and supported wiring
   and shows its accuracy class and communication ports.
   ========================================================================== */
(function () {
  var HW = window.ED_HW; if (!HW) return;
  var TYPE = { "Moxa MGate MB3170": "Modbus TCP gateway", "Schneider Link150": "Modbus TCP gateway", "Schneider Com'X 510": "Energy server / data logger",
    "Siemens SIMATIC IOT2050": "Edge device (Node-RED)", "Teltonika TRB245": "4G IoT edge device", "Milesight UG65": "Wireless (LoRaWAN) gateway" };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function opts(names, val) { return '<option value=""' + (val ? "" : " selected") + ' disabled>Select…</option>' + names.map(function (n) { return '<option' + (n === val ? " selected" : "") + ">" + esc(n) + "</option>"; }).join(""); }
  function pick(sel, text) { if (!sel) return; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text.indexOf(text) === 0) { sel.selectedIndex = i; return; } }
  function box(el) { return el.closest(".modal__body") || el.closest("form") || document; }

  /* ---------- devices ---------- */
  function devChange(sel, init) {
    var M = HW.devices[sel.value], b = box(sel), h = sel.closest(".field").querySelector("[data-hw-hint]");
    if (!M) { if (h) h.textContent = "Required · pick the gateway / logger installed on site"; return; }
    if (h) h.textContent = M.kind + " · " + M.ethernet + (M.serial ? " · " + M.serial : "") + (M.cellular ? " · " + M.cellular : "") + " · " + M.power;
    if (init) return; // edit form keeps the saved settings
    pick(b.querySelector("[data-hw-type]"), TYPE[sel.value] || "");
    pick(b.querySelector("[data-hw-field]"), M.protocols[0] === "LoRaWAN" ? "LoRaWAN" : "Modbus RTU");
    pick(b.querySelector("[data-hw-uplink]"), M.uplinks[0]);
    var port = b.querySelector("[data-hw-port]"); if (port && M.defaults.port) port.value = M.defaults.port;
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-hw-device]"), function (sel) {
    sel.innerHTML = opts(Object.keys(HW.devices), sel.getAttribute("data-value"));
    devChange(sel, true);
  });

  /* ---------- meters ---------- */
  var MAPS = [];
  Object.keys(HW.meters).forEach(function (k) { if (MAPS.indexOf(HW.meters[k].map) < 0) MAPS.push(HW.meters[k].map); });
  MAPS.push("Custom (upload register list)");
  function meterChange(sel, init) {
    var M = HW.meters[sel.value], b = box(sel), h = sel.closest(".field").querySelector("[data-hw-hint]");
    if (!M) { if (h) h.textContent = "Required · sets the meter class and register map"; return; }
    if (h) h.textContent = M.kind + " · " + M.accuracy + " · " + M.comms;
    var map = b.querySelector("[data-hw-map]"); if (map) map.value = M.map;
    var w = b.querySelector("[data-hw-wiring]");
    if (w) Array.prototype.forEach.call(w.options, function (o) { o.disabled = M.wiring.indexOf(o.text.split(" ")[0]) < 0; if (o.disabled && o.selected) o.selected = false; });
    if (init) return;
    var cls = b.querySelector("[data-class-select]");
    if (cls) { cls.value = M.mclass; cls.dispatchEvent(new Event("change", { bubbles: true })); }
    var cts = b.querySelector("[data-hw-cts]"); if (cts && /Direct/.test(M.inputs)) pick(cts, "Direct connected");
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-hw-map]"), function (sel) { sel.innerHTML = MAPS.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join(""); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-hw-meter]"), function (sel) {
    sel.innerHTML = opts(Object.keys(HW.meters), sel.getAttribute("data-value"));
    meterChange(sel, true);
  });

  document.addEventListener("change", function (e) {
    if (!e.target.matches) return;
    if (e.target.matches("[data-hw-device]")) devChange(e.target);
    if (e.target.matches("[data-hw-meter]")) meterChange(e.target);
  });
})();
