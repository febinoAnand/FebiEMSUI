/* ==========================================================================
   Energy Dashboard — customisable home dashboard (dashboard.html)
   Every card inside #dash-grid is a .widget. "Customize" switches to edit mode:
   drag (or ← →) to reorder, pick a width, remove, or add from the library.
   The layout is saved per user + tenant in this browser's localStorage.
   ========================================================================== */
(function () {
  var grid = document.getElementById("dash-grid");
  if (!grid) return;
  var bar = document.getElementById("dash-editbar");
  var empty = document.getElementById("dash-empty");
  var lib = document.getElementById("widget-lib");
  var SIZES = [[3, "¼"], [4, "⅓"], [6, "½"], [8, "⅔"], [9, "¾"], [12, "Full"]];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function widgets() { return Array.prototype.slice.call(grid.querySelectorAll(":scope > .widget")); }
  function visible() { return widgets().filter(function (w) { return !w.hidden; }); }
  function byId(id) { return grid.querySelector('.widget[data-widget="' + id + '"]'); }

  /* ---------- storage (per user, per tenant) ---------- */
  function key() {
    var s = null;
    try { s = window.EDStore && EDStore.session(); } catch (e) { s = null; }
    return "ed-dash:" + (s && s.status === "ok" ? s.user.org + ":" + s.user.id : "guest");
  }
  function load() { try { return JSON.parse(localStorage.getItem(key()) || "null"); } catch (e) { return null; } }
  function save() {
    var layout = visible().map(function (w) { return { id: w.dataset.widget, size: +w.dataset.size }; });
    try { localStorage.setItem(key(), JSON.stringify(layout)); } catch (e) { /* storage blocked — layout lasts for this visit */ }
    refresh();
  }

  var DEFAULT = widgets().map(function (w) { return { id: w.dataset.widget, size: +w.dataset.size, on: w.dataset.default !== "off" }; });

  function apply(layout) {
    widgets().forEach(function (w) { w.hidden = true; });
    layout.forEach(function (item) {
      var w = byId(item.id);
      if (!w) return;
      grid.appendChild(w);
      w.dataset.size = Math.max(+w.dataset.min || 3, +item.size || +w.dataset.size);
      w.hidden = false;
    });
    // keep hidden widgets at the end, in library order
    DEFAULT.forEach(function (d) { var w = byId(d.id); if (w.hidden) grid.appendChild(w); });
    refresh();
  }

  /* ---------- per-widget toolbar (shown in edit mode) ---------- */
  widgets().forEach(function (w) {
    var min = +w.dataset.min || 3;
    var sizes = SIZES.filter(function (s) { return s[0] >= min; }).map(function (s) {
      return '<option value="' + s[0] + '">' + s[1] + "</option>";
    }).join("");
    var tb = document.createElement("div");
    tb.className = "widget__bar";
    tb.innerHTML =
      '<span class="widget__grip" title="Drag to move" aria-hidden="true"><i class="ic i-grip"></i></span>' +
      '<strong class="widget__name">' + esc(w.dataset.title) + "</strong>" +
      '<select class="widget__size" title="Width" aria-label="Width of ' + esc(w.dataset.title) + '">' + sizes + "</select>" +
      '<button type="button" class="widget__btn" data-move="-1" title="Move earlier" aria-label="Move ' + esc(w.dataset.title) + ' earlier"><i class="ic i-arrow-left"></i></button>' +
      '<button type="button" class="widget__btn" data-move="1" title="Move later" aria-label="Move ' + esc(w.dataset.title) + ' later"><i class="ic i-arrow-right"></i></button>' +
      '<button type="button" class="widget__btn widget__btn--del" data-remove title="Remove" aria-label="Remove ' + esc(w.dataset.title) + '"><i class="ic i-x"></i></button>';
    w.insertBefore(tb, w.firstChild);
  });

  function refresh() {
    var vis = visible();
    widgets().forEach(function (w) { w.querySelector(".widget__size").value = w.dataset.size; });
    vis.forEach(function (w, i) {
      w.querySelector('[data-move="-1"]').disabled = i === 0;
      w.querySelector('[data-move="1"]').disabled = i === vis.length - 1;
    });
    empty.hidden = vis.length > 0;
    renderLib();
  }

  grid.addEventListener("click", function (e) {
    var w = e.target.closest(".widget");
    if (!w || !grid.classList.contains("is-editing")) return;
    var moveBtn = e.target.closest("[data-move]");
    if (moveBtn) {
      var vis = visible(), i = vis.indexOf(w), j = i + +moveBtn.dataset.move;
      if (j < 0 || j >= vis.length) return;
      grid.insertBefore(w, +moveBtn.dataset.move < 0 ? vis[j] : vis[j].nextSibling);
      save();
      var f = moveBtn.disabled ? w.querySelector("[data-move]:not(:disabled)") : moveBtn;
      if (f) f.focus();
    } else if (e.target.closest("[data-remove]")) {
      w.hidden = true; grid.appendChild(w); save();
    }
  });

  grid.addEventListener("change", function (e) {
    if (!e.target.classList.contains("widget__size")) return;
    e.target.closest(".widget").dataset.size = e.target.value;
    save();
  });

  /* ---------- drag to reorder (mouse / pen) ---------- */
  var dragged = null;
  grid.addEventListener("dragstart", function (e) {
    var w = e.target.closest && e.target.closest(".widget");
    if (!w || !grid.classList.contains("is-editing")) return;
    dragged = w;
    w.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", w.dataset.widget); } catch (err) { /* old browsers */ }
  });
  grid.addEventListener("dragover", function (e) {
    if (!dragged) return;
    e.preventDefault();
    var over = e.target.closest(".widget");
    if (!over || over === dragged || over.hidden) return;
    var r = over.getBoundingClientRect();
    var after = r.width > r.height * 1.6 && over.dataset.size === "12" ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    var ref = after ? over.nextSibling : over;
    if (ref !== dragged && ref !== dragged.nextSibling) grid.insertBefore(dragged, ref);
  });
  function endDrag() { if (!dragged) return; dragged.classList.remove("is-dragging"); dragged = null; save(); }
  grid.addEventListener("drop", function (e) { e.preventDefault(); endDrag(); });
  grid.addEventListener("dragend", endDrag);

  /* ---------- edit mode ---------- */
  function setEditing(on) {
    grid.classList.toggle("is-editing", on);
    bar.hidden = !on;
    widgets().forEach(function (w) { w.draggable = on; });
    document.querySelectorAll("[data-dash-edit]").forEach(function (b) { b.hidden = on; });
  }
  document.querySelectorAll("[data-dash-edit]").forEach(function (b) {
    b.addEventListener("click", function () { setEditing(true); bar.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  });
  bar.querySelector("[data-dash-done]").addEventListener("click", function () {
    setEditing(false);
    var t = document.getElementById("saved");
    if (t) { t.classList.remove("is-shown"); void t.offsetWidth; t.classList.add("is-shown"); setTimeout(function () { t.classList.remove("is-shown"); }, 4000); }
  });
  bar.querySelector("[data-dash-reset]").addEventListener("click", function () {
    if (!confirm("Reset the dashboard to the default layout?")) return;
    try { localStorage.removeItem(key()); } catch (e) { /* storage blocked */ }
    apply(DEFAULT.filter(function (d) { return d.on; }));
  });

  /* ---------- widget library (Add widget modal) ---------- */
  function renderLib() {
    lib.innerHTML = DEFAULT.map(function (d) {
      var w = byId(d.id), on = !w.hidden;
      return '<div class="widget-lib__item' + (on ? " is-added" : "") + '">' +
        '<span class="icon-tile"><i class="ic ' + esc(w.dataset.icon) + '"></i></span>' +
        '<div class="grow"><strong>' + esc(w.dataset.title) + "</strong><small>" + esc(w.dataset.desc) + "</small></div>" +
        (on ? '<span class="badge badge--success"><i class="ic i-check"></i> Added</span>'
            : '<button type="button" class="btn btn--sm btn--soft" data-add="' + esc(d.id) + '"><i class="ic i-plus"></i> Add</button>') +
        "</div>";
    }).join("");
  }
  lib.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]");
    if (!b) return;
    var w = byId(b.dataset.add);
    var last = visible().pop();
    grid.insertBefore(w, last ? last.nextSibling : grid.firstChild);
    w.hidden = false;
    if (!grid.classList.contains("is-editing")) setEditing(true);
    save();
  });

  var saved = load();
  apply(Array.isArray(saved) ? saved : DEFAULT.filter(function (d) { return d.on; }));
  setEditing(false);
})();
