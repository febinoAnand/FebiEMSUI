/* ==========================================================================
   Energy Dashboard — wide tables scroll sideways from anywhere
   For every .table-wrap that is wider than the screen (added now or later):
   • a scrollbar that stays on screen (bottom edge) the whole time the table is in view
   • drag with the mouse anywhere in the table to move it left / right
     (links, buttons and fields still work as usual)
   • ‹ › buttons on the left / right edge, shown only when there is more that way
   • touch swipe, Shift + mouse wheel, trackpads and ← → keys keep working
   ========================================================================== */
(function () {
  var INTERACTIVE = "a, button, input, select, textarea, label, summary, [contenteditable], [role=button]";

  function enhance(wrap) {
    if (wrap.dataset.hscroll) return;
    wrap.dataset.hscroll = "1";
    if (!wrap.hasAttribute("tabindex")) wrap.tabIndex = 0; // ← → keys scroll it once clicked / focused
    wrap.setAttribute("aria-label", wrap.getAttribute("aria-label") || "Table · scroll sideways for more columns");
    var box = document.createElement("div");
    box.className = "hscroll";
    // A table that is itself a tab panel (Roles → permission matrix): the wrapper becomes the panel,
    // because tabs show / hide their panels as direct children
    if (wrap.classList.contains("tab-panel")) {
      box.classList.add("tab-panel");
      box.setAttribute("data-tab", wrap.getAttribute("data-tab"));
      wrap.classList.remove("tab-panel");
      wrap.removeAttribute("data-tab");
    }
    wrap.parentNode.insertBefore(box, wrap);
    box.appendChild(wrap);
    box.insertAdjacentHTML("beforeend",
      // each button rides in a full-height rail and sticks to the middle of the screen, so it's reachable anywhere along a tall table
      '<div class="hscroll__rail hscroll__rail--l"><button type="button" class="hscroll__btn hscroll__btn--l" tabindex="-1" aria-label="Scroll table left"><i class="ic i-chev-left"></i></button></div>' +
      '<div class="hscroll__rail hscroll__rail--r"><button type="button" class="hscroll__btn hscroll__btn--r" tabindex="-1" aria-label="Scroll table right"><i class="ic i-chev-right"></i></button></div>' +
      // the scrollbar: sticks to the bottom of the screen while the table is in view, and rests under the table at its end
      '<div class="hscroll__bar" aria-hidden="true"><div class="hscroll__track"></div></div>');
    var l = box.querySelector(".hscroll__btn--l"), r = box.querySelector(".hscroll__btn--r");
    var bar = box.querySelector(".hscroll__bar"), track = box.querySelector(".hscroll__track");
    // keep the bar and the table at the same position (comparing positions avoids an endless back-and-forth)
    bar.addEventListener("scroll", function () { if (Math.abs(wrap.scrollLeft - bar.scrollLeft) > 1) wrap.scrollLeft = bar.scrollLeft; }, { passive: true });
    function update() {
      var max = wrap.scrollWidth - wrap.clientWidth;
      box.classList.toggle("is-wide", max > 2);
      track.style.width = wrap.scrollWidth + "px";
      if (Math.abs(bar.scrollLeft - wrap.scrollLeft) > 1) bar.scrollLeft = wrap.scrollLeft;
      l.hidden = wrap.scrollLeft <= 2;
      r.hidden = wrap.scrollLeft >= max - 2;
    }
    function step(dir) {
      wrap.scrollBy({ left: dir * Math.max(160, wrap.clientWidth * 0.7), behavior: "smooth" });
      setTimeout(update, 450); // after the smooth scroll settles
    }
    l.addEventListener("click", function () { step(-1); });
    r.addEventListener("click", function () { step(1); });
    wrap.addEventListener("scroll", update, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(update).observe(wrap);
    var table = wrap.querySelector("table");
    if (table && window.ResizeObserver) new ResizeObserver(update).observe(table);
    update();

    // Mouse drag to scroll (touch already swipes natively)
    var drag = null;
    wrap.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0 || !box.classList.contains("is-wide")) return;
      if (e.target.closest(INTERACTIVE)) return;
      drag = { x: e.clientX, left: wrap.scrollLeft, moved: false, id: e.pointerId };
    });
    wrap.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) { drag.moved = true; try { wrap.setPointerCapture(drag.id); } catch (err) { /* gone */ } wrap.classList.add("is-dragging"); }
      wrap.scrollLeft = drag.left - dx;
    });
    function end() {
      if (!drag) return;
      var moved = drag.moved; drag = null;
      wrap.classList.remove("is-dragging");
      // a drag shouldn't also count as a click on the row underneath
      if (moved) wrap.addEventListener("click", function stop(ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    }
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
  }

  function scan(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".table-wrap"), enhance);
  }
  function start() {
    scan();
    // tables built later by scripts (users, tenants, alert rules, limits …)
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].addedNodes.length) { scan(); return; }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
