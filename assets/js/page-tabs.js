/* ==========================================================================
   Energy Dashboard — split a long detail page into tabs (device.html, meter.html)
   The page scripts build everything first; on window load this moves each card
   into a tab by its title. The header and KPI tiles stay above the tabs. A row
   holding cards for different tabs is split, each card going to its own tab.
   The open tab is kept in the URL (?tab=…) so reload / shared links reopen it,
   and a resize event is sent when a tab opens so its charts redraw at full size.
   Usage: <main data-page-tabs="device|meter"> + the TABS table below.
   ========================================================================== */
(function () {
  var TABS = {
    device: [
      { key: "overview", label: "Overview", icon: "i-grid", match: /^(Signal strength|Network & protocol|Hardware & firmware|Event log)/ },
      { key: "meters", label: "Meters", icon: "i-gauge", match: /^Connected meters/ },
      { key: "telemetry", label: "Telemetry", icon: "i-activity", match: /^Telemetry (log|chart)/ },
      { key: "commands", label: "Commands", icon: "i-send", match: /^(Send command|Command history)/ },
      { key: "publish", label: "Data publish", icon: "i-upload", match: /^(Publish destinations|Payload preview)/ },
      { key: "logs", label: "Data logs", icon: "i-clock", match: /^Data logs/ },
      { key: "connections", label: "Connections", icon: "i-flow", match: /^Connections/ },
    ],
    meter: [
      { key: "live", label: "Live", icon: "i-gauge", match: /^(Live gauges|Electrical parameters)/ },
      { key: "energy", label: "Energy", icon: "i-chart", match: /^(Power today|Generation today|Daily energy|Daily generation)/ },
      { key: "subs", label: "Sub-meters", icon: "i-layers", match: /^(Sub-meters|Actual vs sub-meters|Share by sub-meter)/ },
      { key: "alerts", label: "Alerts", icon: "i-bell", match: /^Alert rules/ },
      { key: "device", label: "Device & connections", icon: "i-cpu", match: /^(Reporting device|Connections)/ },
    ],
  };

  function titleOf(card) { var t = card.querySelector(".card__title"); return t ? t.textContent.replace(/\s+/g, " ").trim() : ""; }

  function build(main, rules) {
    var kids = Array.prototype.slice.call(main.children);
    var panels = {}, order = [], insertAt = null;
    function panel(rule) {
      if (!panels[rule.key]) {
        var p = document.createElement("div");
        p.className = "page-tab"; p.id = "tab-" + rule.key; p.setAttribute("role", "tabpanel");
        panels[rule.key] = p; order.push(rule);
      }
      return panels[rule.key];
    }
    function ruleFor(card) {
      var t = titleOf(card);
      for (var i = 0; i < rules.length; i++) if (rules[i].match.test(t)) return rules[i];
      return null;
    }
    kids.forEach(function (sec) {
      // cards inside this top-level section, and the tab each belongs to
      var cards = sec.matches(".card") && sec.querySelector(".card__title") ? [sec]
        : Array.prototype.filter.call(sec.querySelectorAll(".card"), function (c) { return c.querySelector(".card__title") && !c.parentElement.closest(".card"); });
      var found = cards.map(function (c) { return { card: c, rule: ruleFor(c) }; }).filter(function (x) { return x.rule; });
      if (!found.length) return; // header, tiles, callouts stay on top
      if (!insertAt) insertAt = sec;
      var keys = found.map(function (x) { return x.rule.key; }).filter(function (k, i, a) { return a.indexOf(k) === i; });
      if (keys.length === 1) { panel(found[0].rule).appendChild(sec); return; }
      // mixed row: each card (with its column wrapper) goes to its own tab
      found.forEach(function (x) {
        var el = x.card;
        while (el.parentElement && el.parentElement !== sec) el = el.parentElement;
        // a column holding cards for other tabs too → move just this card
        var shared = el !== x.card && found.some(function (y) { return y !== x && y.rule !== x.rule && el.contains(y.card); });
        panel(x.rule).appendChild(el === sec || shared ? x.card : el);
      });
      sec.remove();
    });
    if (order.length < 2) { order.forEach(function (r) { while (panels[r.key].firstChild) main.appendChild(panels[r.key].firstChild); }); return; }
    order.sort(function (a, b) { return rules.indexOf(a) - rules.indexOf(b); });

    var bar = document.createElement("nav");
    bar.className = "tab-list page-tabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Sections");
    bar.innerHTML = order.map(function (r) {
      var count = (titleOf(panels[r.key].querySelector(".card") || document.createElement("i")).match(/\((\d+)\)/) || [])[1];
      return '<button type="button" role="tab" id="tabbtn-' + r.key + '" aria-controls="tab-' + r.key + '" data-tab-key="' + r.key + '"><i class="ic ' + r.icon + '"></i> ' + r.label +
        (count && r.key !== "overview" ? ' <span class="page-tabs__n">' + count + "</span>" : "") + "</button>";
    }).join("");
    var holder = document.createElement("div");
    holder.className = "page-tabs-wrap";
    holder.appendChild(bar);
    order.forEach(function (r) { panels[r.key].setAttribute("aria-labelledby", "tabbtn-" + r.key); holder.appendChild(panels[r.key]); });
    main.insertBefore(holder, insertAt && insertAt.parentNode === main ? insertAt : null);

    function show(key, focus) {
      if (!panels[key]) key = order[0].key;
      order.forEach(function (r) {
        var on = r.key === key, b = bar.querySelector('[data-tab-key="' + r.key + '"]');
        panels[r.key].hidden = !on;
        b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      var u = new URL(location.href);
      if (key === order[0].key) u.searchParams.delete("tab"); else u.searchParams.set("tab", key);
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
      window.dispatchEvent(new Event("resize")); // charts measured while hidden redraw at full width
    }
    bar.addEventListener("click", function (e) { var b = e.target.closest("[data-tab-key]"); if (b) show(b.getAttribute("data-tab-key")); });
    bar.addEventListener("keydown", function (e) {
      var keys = order.map(function (r) { return r.key; }), cur = keys.indexOf(bar.querySelector(".is-on").getAttribute("data-tab-key"));
      var next = e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
      if (next === null) return;
      e.preventDefault();
      show(keys[(next + keys.length) % keys.length], true);
    });
    // a link to an element inside a tab (#meter-rules) opens that tab
    function tabOfHash() {
      var el = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
      var p = el && el.closest(".page-tab");
      return p ? p.id.replace(/^tab-/, "") : null;
    }
    window.addEventListener("hashchange", function () { var k = tabOfHash(); if (k) show(k); });
    show(tabOfHash() || new URLSearchParams(location.search).get("tab") || order[0].key);
  }

  window.addEventListener("load", function () {
    var main = document.querySelector("main[data-page-tabs]");
    if (main && TABS[main.getAttribute("data-page-tabs")]) build(main, TABS[main.getAttribute("data-page-tabs")]);
  });
})();
