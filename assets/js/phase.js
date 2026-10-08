/* ==========================================================================
   Energy Dashboard — single-phase / three-phase markers
   Adds a 1φ / 3φ tag next to every meter and sub-meter name in lists (Energy
   Meters, a device's connected meters), using "phase" from meter-data.js, and
   keeps the Supply field hint in the meter forms in step with the choice.
   ========================================================================== */
(function () {
  var PHASE = {};
  (window.ED_METERS || []).forEach(function (m) {
    PHASE[m.id] = m.phase === 1 ? 1 : 3;
    (m.subs || []).forEach(function (s) { PHASE[s.id] = s.phase === 1 ? 1 : 3; });
  });
  function tag(ph) {
    return '<span class="ph ph--' + ph + '" title="' + (ph === 1 ? "Single-phase · 2-wire · 230 V" : "Three-phase · 4-wire · 415 V") + '">' + ph + "φ</span>";
  }
  function mark(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('a.row-link[href*="meter.html?id="]'), function (a) {
      if (a.dataset.ph) return;
      var id = (a.getAttribute("href").split("id=")[1] || "").split(/[&#]/)[0].toUpperCase();
      if (!PHASE[id]) return;
      a.dataset.ph = "1";
      a.insertAdjacentHTML("afterend", tag(PHASE[id]));
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
})();
