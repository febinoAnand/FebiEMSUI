/* ==========================================================================
   Energy Dashboard — tiny progressive-enhancement script
   Loaded synchronously in <head> (after store.js) so the theme and the login
   guard run before paint. This file adds:
     1. Three themes — daylight (plain light) · aurora (colourful light) · midnight (dark)
     2. Login guard on app pages + flow messages driven by ?query flags
     3. Esc closes an open :target modal
   Page behaviour lives in auth.js (sign-in pages), workspace.js (app pages)
   and users.js (Users page).
   ========================================================================== */
(function () {
  var KEY = "ed-theme";
  var THEMES = { daylight: "light", aurora: "light", midnight: "dark" };
  var VIVID = { aurora: true }; // colourful sidebar, banners and KPI gradients
  var DEFAULTS = { light: "daylight", dark: "midnight" };
  var BAR = { daylight: "#f6f7fb", aurora: "#f1f0fb", midnight: "#0e1120" }; // mobile browser bar
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: applies to this page only */ } }

  // The saved theme id, or null when the visitor hasn't chosen (then we follow the OS).
  function stored() {
    var t = get(KEY);
    if (THEMES[t]) return t;
    // Migrate choices from earlier versions (retired themes map to the closest one)
    if (t === "ocean" || t === "sunset" || t === "light") return "aurora";
    if (t === "forest" || t === "dark") return "midnight";
    return null;
  }
  function current() {
    return stored() || (media && media.matches ? DEFAULTS.dark : DEFAULTS.light);
  }
  function apply(id, animate) {
    if (animate) {
      root.classList.add("theme-anim");
      window.setTimeout(function () { root.classList.remove("theme-anim"); }, 400);
    }
    var mode = THEMES[id];
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-palette", id);
    if (VIVID[id]) root.setAttribute("data-vivid", ""); else root.removeAttribute("data-vivid");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", BAR[id]);
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute("aria-label", mode === "dark" ? "Switch to a light theme" : "Switch to a dark theme");
      toggles[i].setAttribute("title", mode === "dark" ? "Light theme" : "Dark theme");
    }
    var radios = document.querySelectorAll("input[data-theme-set]");
    for (var j = 0; j < radios.length; j++) radios[j].checked = radios[j].value === id;
  }
  function choose(id) {
    if (!THEMES[id]) return;
    set(KEY, id);
    set("ed-theme-" + THEMES[id], id); // remember the last light / dark pick for the toggle
    apply(id, true);
  }

  // 1. Before first paint
  apply(current(), false);

  if (media) {
    var onSystemChange = function () { if (!stored()) apply(current(), true); };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  function params() {
    var out = {};
    location.search.replace(/^\?/, "").split("&").forEach(function (p) {
      if (!p) return;
      var kv = p.split("=");
      out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
    return out;
  }

  // ---------- Page guard (uses EDStore from store.js) ----------
  // Only same-site app pages are valid redirect targets (prevents open redirects via ?next=)
  function safeNext(n) {
    if (!n || !/^[a-z-]+\.html(?:[?#][^\s]*)?$/i.test(n)) return null;
    return /^(login|login-approval|admin-login|register|register-success|verify-email|awaiting-approval|forgot-password|accept-invite|tenant-approvals|index)\.html/i.test(n) ? null : n;
  }
  function here() {
    return (location.pathname.split("/").pop() || "dashboard.html") + location.search + location.hash;
  }
  function hideAndGo(url) {
    root.style.visibility = "hidden";
    location.replace(url);
  }
  window.EDNav = { safeNext: safeNext, params: params };

  // Before first paint:
  //   <html data-auth="required"> app pages → login unless there's a valid session
  //   <html data-auth="guest">    login page → straight in when already signed in
  var auth = root.getAttribute("data-auth");
  var q0 = params();
  if (auth && window.EDStore) {
    var st = EDStore.session();
    if (auth === "required" && st.status !== "ok") {
      var why = st.status === "expired" ? "expired=1&" : st.status === "revoked" ? "revoked=1&" : "";
      hideAndGo("login.html?" + why + "next=" + encodeURIComponent(here()));
    } else if (auth === "guest" && st.status === "ok" && q0.signedout === undefined) {
      hideAndGo(safeNext(q0.next) || "dashboard.html");
    } else if (auth === "platform" && !EDStore.adminSession()) {
      hideAndGo("admin-login.html"); // Control Center needs the platform-admin session
    }
  }
  document.addEventListener("DOMContentLoaded", function () {
    apply(current(), false);

    // Moon / sun button: jump to the last-used theme on the other side
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-theme-toggle]");
      if (!t) return;
      e.preventDefault();
      var other = THEMES[current()] === "dark" ? "light" : "dark";
      var last = get("ed-theme-" + other);
      choose(THEMES[last] === other ? last : DEFAULTS[other]);
    });

    document.addEventListener("change", function (e) {
      var r = e.target;
      if (r && r.hasAttribute && r.hasAttribute("data-theme-set") && r.checked) choose(r.value);
    });

    // 2. Flow flags: ?mode=login, ?reset=1, ?signedout=1, ?created=1, ?joined=1 …
    var q = params();

    // Elements shown only for a given flow: data-flow-show="mode:login"
    var shows = document.querySelectorAll("[data-flow-show]");
    for (var i = 0; i < shows.length; i++) {
      var s = shows[i].getAttribute("data-flow-show").split(":");
      var match = s[1] === "*" ? q[s[0]] !== undefined : q[s[0]] === s[1];
      if (match) shows[i].classList.add("is-shown");
    }
    // Elements hidden for a given flow: data-flow-hide="mode:login"
    var hides = document.querySelectorAll("[data-flow-hide]");
    for (var k = 0; k < hides.length; k++) {
      var h = hides[k].getAttribute("data-flow-hide").split(":");
      if (q[h[0]] === h[1]) hides[k].hidden = true;
    }
    // Forms whose destination depends on the flow: data-action-login="dashboard.html"
    if (q.mode) {
      var forms = document.querySelectorAll("form[data-action-" + q.mode + "]");
      for (var f = 0; f < forms.length; f++) forms[f].setAttribute("action", forms[f].getAttribute("data-action-" + q.mode));
    }
    // Toasts that pop on arrival: <div class="toast" data-flow-toast="joined">
    var toasts = document.querySelectorAll("[data-flow-toast]");
    for (var t = 0; t < toasts.length; t++) {
      if (q[toasts[t].getAttribute("data-flow-toast")] !== undefined) toasts[t].classList.add("is-shown");
    }

    // ---------- Prefill a dialog from the clicked link: data-prefill='{"element-id":"value"}' ----------
    // Inputs/selects get the value; any other element gets it as text (e.g. a dialog subtitle).
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-prefill]");
      if (!a) return;
      var map;
      try { map = JSON.parse(a.getAttribute("data-prefill")); } catch (err) { return; }
      for (var id in map) {
        var el = document.getElementById(id);
        if (!el) continue;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.value = map[id];
        else el.textContent = map[id];
      }
    });

    // Alerts opened from a meter dashboard (alerts.html?target=MTR-1001#add-rule): pre-select that meter
    var ruleTarget = document.getElementById("rule-target");
    if (ruleTarget && q.target) ruleTarget.value = q.target.toUpperCase();

    // ---------- Show / hide password: <button data-pw-toggle="input-id"> ----------
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-pw-toggle]");
      if (!b) return;
      var input = document.getElementById(b.getAttribute("data-pw-toggle"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.textContent = show ? "Hide" : "Show";
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });

    // ---------- Copy to clipboard: data-copy="<selector of element whose text to copy>" ----------
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-copy]");
      if (!b) return;
      e.preventDefault();
      var src = document.querySelector(b.getAttribute("data-copy"));
      var text = src ? (src.value != null && src.tagName === "INPUT" ? src.value : src.textContent.trim()) : "";
      var done = function () {
        var label = b.querySelector("span");
        if (!label) { b.setAttribute("title", "Copied!"); b.classList.add("is-copied"); setTimeout(function () { b.classList.remove("is-copied"); }, 1500); return; }
        var old = label.textContent;
        label.textContent = "Copied";
        setTimeout(function () { label.textContent = old; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (err) { /* nothing more we can do */ }
        document.body.removeChild(ta);
        done();
      }
    });

    // ---------- Sign out ----------
    if (q.signedout !== undefined && window.EDStore) EDStore.signOut();
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-signout]");
      if (a && window.EDStore) EDStore.signOut();
    });
    // OTP boxes: advance / go back automatically
    var otp = document.querySelector(".otp");
    if (otp) {
      var boxes = otp.querySelectorAll("input");
      otp.addEventListener("input", function (e) {
        var el = e.target, idx = Array.prototype.indexOf.call(boxes, el);
        el.value = el.value.replace(/\D/g, "").slice(-1);
        if (el.value && boxes[idx + 1]) boxes[idx + 1].focus();
      });
      otp.addEventListener("keydown", function (e) {
        var idx = Array.prototype.indexOf.call(boxes, e.target);
        if (e.key === "Backspace" && !e.target.value && boxes[idx - 1]) boxes[idx - 1].focus();
      });
      otp.addEventListener("paste", function (e) {
        var digits = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, boxes.length);
        if (!digits) return;
        e.preventDefault();
        for (var d = 0; d < digits.length; d++) boxes[d].value = digits[d];
        boxes[Math.min(digits.length, boxes.length - 1)].focus();
      });
    }
  });

  // 3. Esc closes the open modal / mobile menu
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var nav = document.getElementById("nav-toggle");
    if (nav && nav.checked) { nav.checked = false; return; }
    var open = null;
    try { open = location.hash && document.querySelector(location.hash + ".modal"); } catch (err) { /* hash isn't a valid selector */ }
    if (open) location.hash = "close";
  });
})();
