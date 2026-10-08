/* ==========================================================================
   Energy Dashboard — pagination for every table
   • Cards with class "paged" (rows split into <tbody data-page="N"> groups with
     radio buttons) become a real pager; their "Rows per page" box now works.
   • Every other table gets a pager added under it: "Showing x–y of n",
     Rows per page (5 / 10 / 20 / 50 / All) and Prev / page numbers / Next.
     Tables that scripts build or rebuild later (tenants, a tenant's users and
     limits, a device's meters …) are picked up automatically.
   An item is a row — or, in tree tables where each <tbody> holds a meter / device
   with its children, a whole <tbody>, so a parent is never split from its children.
   Left alone: tables that page themselves (Users, Alerts → Alert rules), the
   electrical-parameters panel (.param-table) and permission grids inside dialogs.
   ========================================================================== */
(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var SIZES = [5, 10, 20, 50];

  // Groups (tree tables) or rows
  function itemsOf(table) {
    var bodies = Array.prototype.slice.call(table.tBodies);
    var grouped = bodies.some(function (b) { return b.classList.contains("device"); }); // meter / device trees
    if (grouped) return bodies;
    return bodies.reduce(function (all, b) {
      return all.concat(Array.prototype.slice.call(b.rows).filter(function (r) { return !r.querySelector("td[colspan]") || r.cells.length > 1; }));
    }, []);
  }

  // One pager engine: el = the .pager element, table = the table it pages
  function attach(table, el, size, noun, options) {
    if (table._pager) return table._pager;
    var info = $(".pager__info", el), nav = $(".pager__nav", el), box = $(".pager__size", el);
    if (!info) { info = document.createElement("div"); info.className = "pager__info"; el.insertBefore(info, el.firstChild); }
    if (!box) {
      box = document.createElement("div"); box.className = "pager__size";
      box.innerHTML = 'Rows per page <select class="input" aria-label="Rows per page"></select>';
      info.insertAdjacentElement("afterend", box);
    }
    if (!nav) { nav = document.createElement("div"); nav.className = "pager__nav"; el.appendChild(nav); }
    var select = $("select", box);
    var opts = (options && options.length ? options : SIZES).slice();
    if (opts.indexOf(size) < 0) { opts.push(size); opts.sort(function (a, b) { return a - b; }); }
    select.innerHTML = opts.map(function (n) { return '<option value="' + n + '">' + n + "</option>"; }).join("") + '<option value="0">All</option>';
    select.value = String(size);
    var page = 1, items = [];

    function render() {
      items = itemsOf(table);
      var total = items.length, per = size || total || 1, pages = Math.max(1, Math.ceil(total / per));
      page = Math.min(Math.max(1, page), pages);
      items.forEach(function (it, i) { var hide = i < (page - 1) * per || i >= page * per; if (it.hidden !== hide) it.hidden = hide; });
      var from = total ? (page - 1) * per + 1 : 0, to = Math.min(page * per, total);
      info.innerHTML = "Showing <strong>" + from + "–" + to + "</strong> of <strong>" + total + "</strong> " + noun;
      var h = '<button type="button" class="pg-btn" data-go="' + (page - 1) + '"' + (page === 1 ? " disabled" : "") + ' aria-label="Previous page"><i class="ic i-chev-left"></i></button>';
      for (var p = 1; p <= pages; p++) {
        if (pages > 7 && p > 1 && p < pages && Math.abs(p - page) > 1) { if (p === 2 || p === pages - 1) h += '<span class="pg-gap">…</span>'; continue; }
        h += '<button type="button" class="pg-btn' + (p === page ? " is-current" : "") + '" data-go="' + p + '"' + (p === page ? ' aria-current="page"' : "") + ">" + p + "</button>";
      }
      h += '<button type="button" class="pg-btn" data-go="' + (page + 1) + '"' + (page === pages ? " disabled" : "") + ' aria-label="Next page"><i class="ic i-chev-right"></i></button>';
      nav.innerHTML = h;
    }
    nav.addEventListener("click", function (e) {
      var b = e.target.closest("[data-go]");
      if (!b || b.disabled) return;
      page = +b.getAttribute("data-go");
      render();
    });
    select.addEventListener("change", function () { size = +select.value; page = 1; render(); });
    // Rows replaced by a script (filters, re-renders) → page again
    var queued = false;
    new MutationObserver(function () {
      if (queued) return; queued = true;
      setTimeout(function () { queued = false; render(); }, 0);
    }).observe(table, { childList: true, subtree: true });
    render();
    table._pager = { render: render };
    return table._pager;
  }

  /* ---------- 1. cards with the old CSS-only paging ---------- */
  function upgrade(card) {
    var table = $("table", card), el = $(".pager", card);
    if (!table || !el || table._pager) return;
    var bodies = $$("tbody[data-page]", table);
    var perPage = {};
    bodies.forEach(function (b) { perPage[b.getAttribute("data-page")] = (perPage[b.getAttribute("data-page")] || 0) + (b.classList.contains("device") ? 1 : b.rows.length); });
    var first = perPage["1"] || 10;
    var info = $(".pager__info", el);
    var noun = ((info && info.textContent.match(/of\s+[\d,]+\s+(.+?)\s*$/)) || [])[1] || "rows";
    var sel = $(".pager__size select", el);
    var opts = sel ? $$("option", sel).map(function (o) { return parseInt(o.textContent, 10); }).filter(function (n) { return n > 0; }) : null;
    $$(":scope > .pg-input", card).forEach(function (r) { r.remove(); });
    card.classList.remove("paged");
    bodies.forEach(function (b) { b.removeAttribute("data-page"); });
    // the old static page links are replaced by real buttons
    var nav = $(".pager__nav", el); if (nav) nav.innerHTML = "";
    attach(table, el, first, noun, opts);
  }

  /* ---------- 2. any other table: add a pager under it ---------- */
  function skip(table) {
    if (table._pager || table.classList.contains("param-table")) return true;
    if (table.closest(".modal") && table.classList.contains("perm-matrix")) return true; // checkboxes in a form
    var card = table.closest(".card, .modal__body, details, section");
    // already paged by its own script (Users, Alert rules) or by step 1
    if (card && $(".pager", card) && !card.contains(table.closest(".pager"))) {
      var p = $$(".pager", card).filter(function (x) { return !x.hasAttribute("data-auto"); });
      if (p.length) return true;
    }
    return !table.tBodies.length;
  }
  function nounFor(table) {
    var title = table.closest("details") || table.closest(".card") || table.closest("section") || document.body;
    var t = ((title.querySelector(".card__title, summary") || {}).textContent || "").toLowerCase();
    var m = t.match(/(users|meters|sub-meters|tenants|requests|runs|shifts|resources|permissions|modules|instances)/);
    if (/limits/.test(t)) return "resources";
    if (/permission/.test(t)) return "modules";
    if (/view as table/.test(t)) return "readings";
    return m ? m[1] : "rows";
  }
  function addPager(table) {
    if (skip(table)) return;
    var anchor = table.closest(".hscroll") || table.closest(".table-wrap") || table;
    var el = document.createElement("div");
    el.className = "pager pager--auto";
    el.setAttribute("data-auto", "");
    anchor.insertAdjacentElement("afterend", el);
    attach(table, el, 10, nounFor(table));
  }

  function scan() {
    $$(".paged").forEach(upgrade);
    $$("table").forEach(addPager);
  }
  function start() {
    scan();
    var queued = false;
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType === 1 && (n.tagName === "TABLE" || n.querySelector && n.querySelector("table"))) {
            if (!queued) { queued = true; setTimeout(function () { queued = false; scan(); }, 0); }
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
