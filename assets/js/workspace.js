/* ==========================================================================
   Energy Dashboard — signed-in app pages (demo mode, data in store.js)
   • Fills [data-bind="user.* | org.* | greeting"] from the current session
   • My profile, Change password, Switch organisation (shared modals)
   • Settings → Organisation profile save / delete organisation
   • [data-admin-only] actions are disabled for non-admins
   Exposes window.EDUI (helpers shared with users.js).
   ========================================================================== */
(function () {
  var S = window.EDStore;
  var ctx = S.session();
  if (ctx.status !== "ok") return; // app.js already redirected to login
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function isAdmin() { return ctx.user.role === "Tenant Admin"; }
  function shortName(name) { return name.replace(/\s+(pvt\.?|private|ltd\.?|limited|llp|inc\.?)\b.*$/i, "").trim() || name; }

  /* ---------- Helpers shared with users.js ---------- */
  // Error box inside a modal body / container (created on first use)
  function formError(container, msg) {
    var box = $("[data-form-error]", container);
    if (!box) {
      box = document.createElement("div");
      box.className = "callout callout--danger";
      box.setAttribute("data-form-error", "");
      box.setAttribute("role", "alert");
      box.style.marginBottom = "16px";
      box.innerHTML = '<i class="ic i-alert"></i><span></span>';
      container.insertBefore(box, container.firstChild);
    }
    box.hidden = !msg;
    $("span", box).textContent = msg || "";
    return !msg;
  }
  // Native validation for a set of fields; reports the first invalid one
  function validate(fields) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] && !fields[i].checkValidity()) { fields[i].reportValidity(); return false; }
    }
    return true;
  }
  function toast(id) { location.hash = id; }

  /* ---------- Bindings ---------- */
  function values() {
    var u = ctx.user, t = ctx.tenant, h = new Date().getHours();
    var n = S.membershipsFor(u.email).filter(function (m) { return m.user.status === "active" && m.tenant.status === "active"; }).length;
    var since = new Date(u.created);
    return {
      "user.first": u.first, "user.name": S.fullName(u), "user.initials": S.initials(S.fullName(u)), "user.role": u.role,
      "user.email": u.email, "user.shift": u.shift, "user.since": MONTHS[since.getMonth()] + " " + since.getFullYear(),
      "org.name": t.name, "org.short": shortName(t.name), "org.id": t.id, "org.initials": S.initials(t.name),
      "org.count": "You belong to " + n + (n === 1 ? " organisation." : " organisations."),
      "greeting": h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
    };
  }
  function refresh() {
    ctx = S.session();
    if (ctx.status !== "ok") { location.replace("login.html?revoked=1"); return; }
    var v = values();
    $$("[data-bind]").forEach(function (el) {
      var k = el.getAttribute("data-bind");
      if (v[k] != null) el.textContent = v[k];
    });
    // Admin-only actions
    $$("[data-admin-only]").forEach(function (el) {
      el.classList.toggle("is-disabled", !isAdmin());
      if (!isAdmin()) { el.setAttribute("aria-disabled", "true"); el.setAttribute("title", "Only a Tenant Admin can do this"); }
    });
    applyLimits();
  }
  /* ---------- Limits set by the platform admin ----------
     [data-limit="key"]       add / create buttons → disabled when the limit is reached
     [data-limit-full="key"]  callout shown in the add dialog when the limit is reached
     [data-limit-quota="key"] "of 50 allowed" text */
  function applyLimits() {
    var org = ctx.tenant.id, byKey = {};
    S.limits(org).forEach(function (r) { byKey[r.key] = r; });
    $$("[data-limit-quota]").forEach(function (el) {
      var r = byKey[el.getAttribute("data-limit-quota")];
      if (r) el.textContent = r.limit ? "of " + r.limit + " allowed" : "no limit";
    });
    $$("[data-limit-full]").forEach(function (el) {
      var r = byKey[el.getAttribute("data-limit-full")];
      el.hidden = !(r && r.full);
      if (r && r.full) el.innerHTML = '<i class="ic i-alert"></i><span><b>' + r.label + " limit reached.</b> Your organisation can have " + r.limit + " " + r.label.toLowerCase() + " and has " + r.used + ". Contact the platform admin to raise the limit.</span>";
    });
    $$("[data-limit]").forEach(function (el) {
      var r = byKey[el.getAttribute("data-limit")], adminBlocked = el.hasAttribute("data-admin-only") && !isAdmin();
      if (!r) return;
      el.classList.toggle("is-disabled", r.full || adminBlocked);
      el.classList.toggle("is-limited", r.full);
      if (r.full) { el.setAttribute("aria-disabled", "true"); el.setAttribute("title", r.label + " limit reached (" + r.used + " of " + r.limit + ") · ask the platform admin to raise it"); }
      else if (!adminBlocked) { el.removeAttribute("aria-disabled"); el.removeAttribute("title"); }
    });
  }
  window.addEventListener("ed:limits", function () { ctx = S.session(); if (ctx.status === "ok") applyLimits(); });
  window.addEventListener("storage", function (e) { if (e.key === "ed-db") { ctx = S.session(); if (ctx.status === "ok") applyLimits(); } });

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-admin-only].is-disabled, [data-limit].is-disabled");
    if (el) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Keep "last active" fresh (at most once a minute)
  if (!ctx.user.lastActive || Date.now() - ctx.user.lastActive > 6e4) S.updateUser(ctx.user.id, { lastActive: Date.now() });
  refresh();

  /* ---------- My profile ---------- */
  function fillProfile() {
    if (!byId("pf-first")) return;
    byId("pf-first").value = ctx.user.first;
    byId("pf-last").value = ctx.user.last || "";
    byId("pf-email").value = ctx.user.email;
    byId("pf-mobile").value = ctx.user.mobile || "";
    formError($("#profile .modal__body"), "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-save-profile]");
    if (!b) return;
    var body = $("#profile .modal__body");
    var f = ["pf-first", "pf-last", "pf-email", "pf-mobile"].map(byId);
    if (!validate(f)) return e.preventDefault();
    if (S.emailTaken(ctx.user.org, f[2].value, ctx.user.id)) { e.preventDefault(); return formError(body, "Another user in this organisation already uses that email."); }
    S.updateUser(ctx.user.id, { first: f[0].value.trim(), last: f[1].value.trim(), email: f[2].value.trim(), mobile: f[3].value.trim() });
    formError(body, "");
    refresh();
  });

  /* ---------- Change password ---------- */
  function clearPassword() {
    ["cp-current", "cp-new", "cp-confirm"].forEach(function (id) { if (byId(id)) byId(id).value = ""; });
    var body = $("#change-password .modal__body");
    if (body) formError(body, "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-change-password]");
    if (!b) return;
    var body = $("#change-password .modal__body");
    var cur = byId("cp-current"), nw = byId("cp-new"), conf = byId("cp-confirm");
    if (!validate([cur, nw, conf])) return e.preventDefault();
    if (!S.checkPassword(ctx.user, cur.value)) { e.preventDefault(); cur.value = ""; cur.focus(); return formError(body, "Your current password is incorrect."); }
    if (nw.value !== conf.value) { e.preventDefault(); return formError(body, "The new passwords don't match."); }
    if (nw.value === cur.value) { e.preventDefault(); return formError(body, "Choose a password different from your current one."); }
    S.setPassword(ctx.user, nw.value);
    clearPassword();
  });

  /* ---------- Switch organisation ---------- */
  function fillSwitch() {
    var box = $("[data-org-switch]");
    if (!box) return;
    box.innerHTML = "";
    S.membershipsFor(ctx.user.email).forEach(function (m) {
      if (m.user.status !== "active" || m.tenant.status !== "active") return;
      var label = document.createElement("label");
      label.className = "radio-card";
      label.innerHTML = '<input type="radio" name="org-switch" /><span class="radio-card__body row" style="gap:12px"><span class="tenant-switch__logo"></span><span style="flex:1;min-width:0"><strong></strong><br /><small class="mono muted"></small></span><span class="tick"><i class="ic i-check"></i></span></span>';
      var input = $("input", label);
      input.value = m.tenant.id;
      input.checked = m.tenant.id === ctx.tenant.id;
      $(".tenant-switch__logo", label).textContent = S.initials(m.tenant.name);
      $("strong", label).textContent = m.tenant.name;
      $("small", label).textContent = m.tenant.id + " · " + m.user.role;
      box.appendChild(label);
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-switch-org]");
    if (!b) return;
    e.preventDefault();
    var picked = $('[data-org-switch] input:checked');
    if (!picked || picked.value === ctx.tenant.id) { location.hash = "close"; return; }
    if (S.switchTenant(picked.value)) location.href = "dashboard.html";
  });

  /* ---------- Settings → Organisation profile ---------- */
  var orgFields = { "so-name": "name", "so-slug": "slug", "so-gstin": "gstin", "so-industry": "industry", "so-contact": "contact", "so-tz": "timezone", "so-address": "address" };
  function fillOrg() {
    if (!byId("so-name")) return;
    for (var id in orgFields) {
      var el = byId(id), v = ctx.tenant[orgFields[id]] || "";
      if (el.tagName === "SELECT" && v && !$$("option", el).some(function (o) { return o.value === v || o.textContent === v; })) {
        var o = document.createElement("option"); o.textContent = v; el.appendChild(o);
      }
      el.value = v;
      el.disabled = !isAdmin();
    }
  }
  fillOrg();
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-discard-org]")) { fillOrg(); return; }
    var b = e.target.closest && e.target.closest("[data-save-org]");
    if (!b) return;
    var card = b.closest(".card");
    var fields = Object.keys(orgFields).map(byId);
    if (!validate(fields)) return e.preventDefault();
    var slug = byId("so-slug").value.trim().toLowerCase();
    if (slug !== ctx.tenant.slug && S.slugTaken(slug)) { e.preventDefault(); return formError($(".card__body", card), "That workspace URL is already used by another organisation."); }
    var patch = {};
    for (var id in orgFields) patch[orgFields[id]] = byId(id).value.trim();
    patch.slug = slug;
    patch.gstin = patch.gstin.toUpperCase();
    S.updateTenant(ctx.tenant.id, patch);
    formError($(".card__body", card), "");
    refresh();
    fillOrg();
  });

  // Delete organisation (type the Org ID to confirm)
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-delete-org]");
    if (!b) return;
    var input = byId("delete-org-confirm");
    if (!isAdmin() || !input || input.value.trim().toUpperCase() !== ctx.tenant.id) {
      e.preventDefault();
      input.focus();
      input.setCustomValidity("Type " + ctx.tenant.id + " to confirm");
      input.reportValidity();
      setTimeout(function () { input.setCustomValidity(""); }, 2000);
      return;
    }
    S.deleteTenant(ctx.tenant.id);
    S.signOut();
  });

  /* ---------- Fill modals as they open ---------- */
  function onHash() {
    if (location.hash === "#profile") fillProfile();
    else if (location.hash === "#change-password") clearPassword();
    else if (location.hash === "#switch-org") fillSwitch();
    else if (location.hash === "#delete-org" && byId("delete-org-confirm")) byId("delete-org-confirm").value = "";
  }
  window.addEventListener("hashchange", onHash);
  onHash();

  /* ---------- Field-level permissions (Roles & Permissions → Field-level) ----------
     Anything marked data-field="module.field" follows the signed-in user's role:
       no view → hidden (form field, table column, value)
       view without edit → inputs inside become read-only with a 🔒 hint */
  function applyFieldPerms() {
    var role = ctx.user.role, org = ctx.tenant.id;
    $$("[data-field]").forEach(function (el) {
      var p = S.canField(org, role, el.getAttribute("data-field"));
      el.classList.toggle("fp-hidden", !p.view);
      var locked = p.view && !p.edit;
      var inputs = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? [el] : $$("input, select, textarea", el);
      inputs.forEach(function (i) {
        if (locked) {
          if (!i.hasAttribute("data-fp-locked")) i.setAttribute("data-fp-locked", i.disabled ? "was" : "");
          i.disabled = true;
          i.title = "View only for your role (" + role + ")";
        } else if (i.hasAttribute("data-fp-locked")) {
          if (i.getAttribute("data-fp-locked") !== "was") i.disabled = false;
          i.removeAttribute("data-fp-locked");
          i.removeAttribute("title");
        }
      });
      el.classList.toggle("fp-locked", locked && inputs.length > 0);
    });
  }
  // Tables and dialogs are re-rendered by page scripts — re-apply after DOM changes
  var fpTimer;
  new MutationObserver(function () { clearTimeout(fpTimer); fpTimer = setTimeout(applyFieldPerms, 30); })
    .observe(document.body, { childList: true, subtree: true });
  applyFieldPerms();

  window.EDUI = { formError: formError, validate: validate, toast: toast, refresh: refresh, session: function () { return ctx; }, isAdmin: isAdmin, applyFieldPerms: applyFieldPerms };
})();
