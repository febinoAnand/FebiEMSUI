/* ==========================================================================
   Energy Dashboard — single-phase / three-phase markers
   Adds a 1φ / 3φ tag next to every meter and sub-meter name in lists (Energy
   Meters, a device's connected meters), using "phase" from meter-data.js, plus an
   In / Out tag from "dir", and keeps the Supply and Incoming / Outgoing
   field hints in the meter forms in step with the choice.
   ========================================================================== */
(function () {
  var PHASE = {}, DIR = {};
  (window.ED_METERS || []).forEach(function (m) {
    PHASE[m.id] = m.phase === 1 ? 1 : 3; DIR[m.id] = m.dir || (m.kind === "generator" ? "export" : "import");
    (m.subs || []).forEach(function (s) { PHASE[s.id] = s.phase === 1 ? 1 : 3; DIR[s.id] = s.dir || "import"; });
  });
  // every meter is either incoming (import) or outgoing (export)
  function dirTag(d) {
    return d === "export" ? '<span class="ph ph--out" title="Outgoing meter · measures export energy">↑ Out</span>'
      : '<span class="ph ph--in" title="Incoming meter · measures import energy">↓ In</span>';
  }
  function tag(ph) {
    return '<span class="ph ph--' + ph + '" title="' + (ph === 1 ? "Single-phase · 2-wire · 230 V" : "Three-phase · 4-wire · 415 V") + '">' + ph + "φ</span>";
  }
  function mark(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('a.row-link[href*="meter.html?id="]'), function (a) {
      if (a.dataset.ph) return;
      var id = (a.getAttribute("href").split("id=")[1] || "").split(/[&#]/)[0].toUpperCase();
      if (!PHASE[id]) return;
      a.dataset.ph = "1";
      a.insertAdjacentHTML("afterend", tag(PHASE[id]) + dirTag(DIR[id]));
    });
  }
  mark();
  setTimeout(mark, 0); // device.html builds its table after this file loads
  new MutationObserver(function () { mark(); }).observe(document.body, { childList: true, subtree: true });

  // Supply field in the meter forms: explain what each choice measures
  function hint(sel) {
    var h = sel.closest(".field").querySelector("[data-phase-hint]");
    if (h) h.textContent = sel.value === "1" ? "Measures one phase (L–N): voltage, current, PF — no phase imbalance" : "Measures L1, L2, L3 and phase imbalance";
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-phase-select]"), hint);
  document.addEventListener("change", function (e) { if (e.target.matches && e.target.matches("[data-phase-select]")) hint(e.target); });

  // Incoming / Outgoing field: explain the choice; a Generator meter type suggests Outgoing.
  // Creating a meter or sub-meter is blocked until the choice is made.
  var DIR_HINT = { "": "Required · is this meter on an incoming or an outgoing feeder?",
    "import": "Incoming feeder · measures energy taken from the supply (import kWh)",
    "export": "Outgoing feeder · measures energy sent out (export kWh)" };
  function dirHint(sel) { var h = sel.closest(".field").querySelector("[data-dir-hint]"); if (h) h.textContent = DIR_HINT[sel.value || ""]; }
  Array.prototype.forEach.call(document.querySelectorAll("[data-dir-select]"), dirHint);
  document.addEventListener("change", function (e) {
    if (!e.target.matches) return;
    if (e.target.matches("[data-dir-select]")) { e.target.dataset.touched = "1"; e.target.closest(".field").classList.remove("is-invalid"); dirHint(e.target); }
    if (e.target.matches("[data-type-select]")) {
      var d = e.target.closest(".modal__body").querySelector("[data-dir-select]");
      if (d && !d.dataset.touched && /Generator/.test(e.target.value)) { d.value = "export"; dirHint(d); }
    }
  });
  // Meter class field: lists what the chosen class measures (telemetry shows only these)
  var NAMES = { kw: "kW", v: "voltage", i: "current", pf: "PF", hz: "frequency", thdv: "voltage THD", thdi: "current THD", fuel: "fuel level", rh: "run hours", kwh: "kWh register" };
  function classHint(sel) {
    var h = sel.closest(".field").querySelector("[data-class-hint]"), C = (window.ED_METER_CLASSES || {})[sel.value];
    if (h) h.textContent = C ? "Measures " + C.fields.map(function (k) { return NAMES[k]; }).join(", ") : "Required · decides which readings this meter sends";
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-class-select]"), classHint);
  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches("[data-class-select]")) { e.target.closest(".field").classList.remove("is-invalid"); classHint(e.target); }
  });

  // Creating a meter or sub-meter is blocked until Meter class and Incoming / Outgoing are chosen
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest('a[href="#created"]'); if (!btn) return;
    var box = btn.closest(".modal__dialog"), first = null;
    [["[data-class-select]", "[data-class-hint]", "Choose the meter class before creating the meter"],
     ["[data-dir-select]", "[data-dir-hint]", "Choose Incoming or Outgoing before creating the meter"]].forEach(function (c) {
      var d = box.querySelector(c[0]);
      if (d && !d.value) { d.closest(".field").classList.add("is-invalid"); d.closest(".field").querySelector(c[1]).textContent = c[2]; first = first || d; }
    });
    if (first) { e.preventDefault(); e.stopImmediatePropagation(); first.focus(); }
  }, true);
})();
