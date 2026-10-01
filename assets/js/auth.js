/* ==========================================================================
   Energy Dashboard — sign-in pages (demo mode, data in store.js)
   Organisation sign-up → email verification → platform-admin approval → sign in:
     login · admin-login · login-approval · register · verify-email ·
     register-success · awaiting-approval · forgot-password · accept-invite
   Each block runs only when its page element exists.
   ========================================================================== */
(function () {
  var S = window.EDStore;
  var q = window.EDNav.params();
  var next = window.EDNav.safeNext(q.next);
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var val = function (id) { var el = byId(id); return el ? el.value.trim() : ""; };
  var setText = function (sel, text) { $$(sel).forEach(function (el) { el.textContent = text; }); };
  var ss = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  var PENDING_REG = "ed-pending-registration", LAST_ORG = "ed-last-registered-org", PENDING_ORG = "ed-pending-org";

  /* ---------- Shared UI helpers ---------- */
  // Alert box at the top of a form (created on first use)
  function showError(form, msg) {
    var box = $("[data-form-error]", form);
    if (!box) {
      box = document.createElement("div");
      box.className = "callout callout--danger";
      box.setAttribute("data-form-error", "");
      box.setAttribute("role", "alert");
      box.innerHTML = '<i class="ic i-alert"></i><span></span>';
      form.insertBefore(box, form.firstChild);
    }
    box.hidden = !msg;
    $("span", box).textContent = msg || "";
  }
  // Red outline on inputs (+ the matching .field-error message, if any)
  function markError(ids, on) {
    ids.forEach(function (id) {
      var el = byId(id);
      if (el) el.classList.toggle("is-error", on);
      var msg = $('[data-err="' + id + '"]');
      if (msg) msg.classList.toggle("is-shown", on);
    });
  }
  function clearOnInput(form, ids) {
    ids.forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      ["input", "change"].forEach(function (evt) {
        el.addEventListener(evt, function () { markError([id], false); showError(form, ""); });
      });
    });
  }
  var toastTimer;
  function toast(title, text) {
    var t = byId("auth-toast");
    if (!t) return;
    $("[data-toast-title]", t).textContent = title;
    $("[data-toast-text]", t).textContent = text;
    t.classList.remove("is-shown");
    void t.offsetWidth; // restart the animation
    t.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-shown"); }, 4000);
  }
  function maskEmail(email) {
    var p = String(email || "").split("@");
    if (p.length !== 2) return email;
    var name = p[0];
    return (name.length <= 2 ? name.charAt(0) + "*" : name.slice(0, 2) + new Array(Math.max(1, name.length - 2) + 1).join("*")) + "@" + p[1];
  }

  // Demo "Autofill" buttons: data-autofill="ORG|user|password" (data-autofill-target="pv" for the preview form)
  $$("[data-autofill]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-autofill").split("|"), pre = b.getAttribute("data-autofill-target");
      var ids = pre ? [pre + "-org", pre + "-user", pre + "-pw"] : ["org-id", "login-user", "login-pw"];
      ids.forEach(function (id, i) { byId(id).value = v[i]; });
      var form = byId(ids[0]).form;
      markError(ids, false);
      showError(form, "");
    });
  });

  // Demo: wipe every tenant/user created in this browser and restore the sample data
  $$("[data-reset-demo]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (!window.confirm("Delete all organisations and users created in this browser and restore the sample data?")) return;
      S.signOut();
      S.adminSignOut();
      ["ed-db", "ed-remember", "ed-recent-orgs"].forEach(function (k) { try { localStorage.removeItem(k); } catch (err) { /* ignore */ } });
      [PENDING_REG, LAST_ORG, PENDING_ORG].forEach(ss.del);
      location.href = "login.html";
    });
  });

  /* ---------------- Sign In: Organisation ID + Username + Password ----------------
     Empty fields → "Please fill in all fields."; wrong
     details → "Invalid organisation ID, username or password."; organisation not
     active (pending / suspended) → Awaiting Approval screen. */
  var loginForm = byId("login-form");
  if (loginForm) {
    var LOGIN_IDS = ["org-id", "login-user", "login-pw"];
    var orgInput = byId("org-id"), userInput = byId("login-user"), pwInput = byId("login-pw"), rememberBox = byId("remember");
    clearOnInput(loginForm, LOGIN_IDS);

    // Organisation IDs used on this device, with names, as suggestions
    var list = byId("recent-orgs");
    if (list) S.recentOrgs().forEach(function (id) {
      var t = S.tenant(id);
      if (!t) return;
      var o = document.createElement("option");
      o.value = t.id; o.textContent = t.name;
      list.appendChild(o);
    });
    // Remembered details ("Remember me")
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem("ed-remember") || "null"); } catch (e) { saved = null; }
    if (saved) {
      if (saved.org) orgInput.value = saved.org;
      if (saved.user) userInput.value = saved.user;
      rememberBox.checked = true;
    }
    if (q.org && S.tenant(q.org)) orgInput.value = S.tenant(q.org).id;
    if (orgInput.value && userInput.value) pwInput.focus();

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var org = orgInput.value.trim().toUpperCase(), username = userInput.value.trim(), password = pwInput.value;
      if (!org || !username || !password) { markError(LOGIN_IDS, true); return showError(loginForm, "Please fill in all fields."); }
      var t = S.tenant(org);
      var u = t && S.findLogin(org, username);
      if (!t || !u || !S.checkPassword(u, password)) {
        markError(LOGIN_IDS, true);
        return showError(loginForm, u && u.status === "invited"
          ? "You haven't accepted your invitation yet. Use the link your admin sent you to set a password."
          : "Invalid organisation ID, username or password.");
      }
      if (t.status !== "active") { markError(LOGIN_IDS, false); showError(loginForm, ""); showAwaiting(t); return; }
      if (u.status === "suspended") return showError(loginForm, "Your account is suspended. Contact your administrator.");
      if (u.status !== "active") return showError(loginForm, "Your account is inactive. Contact your administrator.");
      var remember = rememberBox.checked;
      try {
        if (remember) localStorage.setItem("ed-remember", JSON.stringify({ org: t.id, user: username }));
        else localStorage.removeItem("ed-remember");
      } catch (err) { /* storage blocked */ }
      S.signIn(u, remember);
      location.href = next || "dashboard.html";
    });
  }

  /* ---------------- Approval Preview Login (always → Awaiting Approval) ---------------- */
  var previewForm = byId("preview-form");
  if (previewForm) {
    var PV_IDS = ["pv-org", "pv-user", "pv-pw"];
    clearOnInput(previewForm, PV_IDS);
    previewForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var org = val("pv-org"), user = val("pv-user"), pw = byId("pv-pw").value;
      if (!org || !user || !pw) { markError(PV_IDS, true); return showError(previewForm, "Please fill in all fields."); }
      // Real credentials of an organisation that is still waiting for approval
      var t = S.tenant(org), u = t && S.findLogin(t.id, user);
      if (!t || !u || !S.checkPassword(u, pw)) { markError(PV_IDS, true); return showError(previewForm, "Invalid organisation ID, username or password."); }
      if (t.status === "active") return showError(previewForm, "This organisation is already approved — use the main sign-in page.");
      showAwaiting(t);
    });
  }

  /* ---------------- Admin Sign In (Control Center) ---------------- */
  var adminForm = byId("admin-login-form");
  if (adminForm) {
    if (S.adminSession()) { location.replace("tenant-approvals.html"); return; }
    var AD_IDS = ["admin-user", "admin-pw"];
    clearOnInput(adminForm, AD_IDS);
    var adminFill = $("[data-autofill-admin]");
    if (adminFill) adminFill.addEventListener("click", function () { byId("admin-user").value = "superadmin"; byId("admin-pw").value = "Control@2026"; markError(AD_IDS, false); showError(adminForm, ""); });
    adminForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!val("admin-user") || !byId("admin-pw").value) { markError(AD_IDS, true); return showError(adminForm, "Please fill in all fields."); }
      if (!S.adminSignIn(val("admin-user"), byId("admin-pw").value)) { markError(AD_IDS, true); return showError(adminForm, "Invalid username or password."); }
      location.href = "tenant-approvals.html";
    });
  }

  /* ---------------- Register organisation (energy site + administrator) ---------------- */
  // Password rule used by every sign-in page: 8+ characters with a letter and a number
  function passwordOk(pw) { return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw); }

  var regForm = byId("register-form");
  if (regForm) {
    var REG_IDS = ["r-org", "r-facility", "r-city", "r-discom", "r-demand", "r-meters", "r-name", "r-email", "r-mobile", "r-username", "r-password", "r-confirm"];
    clearOnInput(regForm, REG_IDS);

    // Password strength meter
    var LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
    var meter = $("[data-strength]", regForm), meterLabel = $("[data-strength-label]", regForm);
    function score(v) {
      var s = 0;
      if (v.length >= 8) s++;
      if (v.length >= 12) s++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
      if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
      return s;
    }
    byId("r-password").addEventListener("input", function () {
      var v = this.value;
      if (!v) { meter.setAttribute("data-strength", "0"); meterLabel.innerHTML = "&nbsp;"; return; }
      var level = v.length < 8 ? 1 : Math.max(1, Math.min(4, score(v) || 1));
      meter.setAttribute("data-strength", String(level));
      meterLabel.textContent = LABELS[v.length < 8 ? 0 : level];
    });

    // Coming back via "Edit email address": restore what was typed (passwords are never kept)
    var draft = null;
    try { draft = JSON.parse(ss.get(PENDING_REG) || "null"); } catch (e) { draft = null; }
    if (draft) {
      ["org", "facility", "city", "discom", "demand", "meters", "name", "email", "mobile", "username"].forEach(function (k) {
        if (draft[k] != null) byId("r-" + k).value = draft[k];
      });
      byId("r-email").focus();
    }

    regForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var username = val("r-username"), password = byId("r-password").value, demand = Number(val("r-demand").replace(/,/g, ""));
      var userMsg = $('[data-err="r-username"]');
      var userOk = /^[A-Za-z0-9._-]{3,30}$/.test(username);
      if (userOk && S.usernameTaken(username)) { userOk = false; userMsg.textContent = "That username is already taken."; }
      else userMsg.textContent = "Choose a username (3–30 letters, numbers, dots or underscores).";
      var checks = {
        "r-org": val("r-org").length >= 3,
        "r-facility": byId("r-facility").value !== "",
        "r-city": val("r-city").length >= 2,
        "r-discom": !val("r-discom") || val("r-discom").length >= 2,          // optional
        "r-demand": !val("r-demand") || (demand >= 1 && demand <= 100000),  // optional
        "r-meters": byId("r-meters").value !== "",
        "r-name": val("r-name").length >= 2,
        "r-email": /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("r-email")),
        "r-mobile": /^[6-9][0-9]{9}$/.test(val("r-mobile")),
        "r-username": userOk,
        "r-password": passwordOk(password),
        "r-confirm": passwordOk(password) && byId("r-confirm").value === password,
      };
      var valid = true;
      for (var id in checks) { markError([id], !checks[id]); if (!checks[id]) valid = false; }
      if (!valid) {
        showError(regForm, "Please fix the highlighted fields.");
        byId(REG_IDS.filter(function (i) { return !checks[i]; })[0]).focus();
        return;
      }
      ss.set(PENDING_REG, JSON.stringify({
        org: val("r-org"), facility: byId("r-facility").value, city: val("r-city"), discom: val("r-discom"), demand: val("r-demand") ? String(demand) : "",
        meters: byId("r-meters").value, name: val("r-name"), email: val("r-email"), mobile: val("r-mobile"), username: username,
        pw: S.hashNewPassword(password),
      }));
      location.href = "verify-email.html";
    });
  }

  /* ---------------- Verify email ---------------- */
  if (byId("verify-email")) {
    var pending = null;
    try { pending = JSON.parse(ss.get(PENDING_REG) || "null"); } catch (e) { pending = null; }
    if (!pending || !pending.email) { location.replace("register.html"); return; }
    setText("[data-pending-email]", pending.email);
    $("[data-resend-email]").addEventListener("click", function () {
      toast("Email sent", "Verification email resent to " + pending.email + ".");
    });
    $("[data-verified]").addEventListener("click", function () {
      // Email confirmed → create the organisation (status "pending") and its Tenant Admin
      var t = S.createTenant({
        name: pending.org, industry: pending.facility, city: pending.city, discom: pending.discom,
        contractDemand: pending.demand ? Number(pending.demand) : 0, meters: pending.meters, contact: pending.email, phone: pending.mobile,
      });
      var parts = pending.name.split(/\s+/);
      S.createUser(t.id, {
        first: parts[0], last: parts.slice(1).join(" "), email: pending.email, username: pending.username,
        mobile: pending.mobile, role: "Tenant Admin", shift: "General", dept: "Management", designation: "Energy Manager",
      }, { pwRecord: pending.pw });
      ss.del(PENDING_REG);
      ss.set(LAST_ORG, t.id);
      location.href = "register-success.html";
    });
  }

  // Organisation summary shown on "Account created" and "Awaiting approval"
  function fillOrgSummary(t) {
    var admin = S.users(t.id).filter(function (u) { return u.role === "Tenant Admin"; })[0];
    setText('[data-os="name"]', t.name);
    setText('[data-os="id"]', t.id);
    setText('[data-os="facility"]', t.industry || "—");
    setText('[data-os="site"]', [t.city, t.discom].filter(Boolean).join(" · ") || "—");
    setText('[data-os="meters"]', t.meters ? t.meters + " meters" : "—");
    setText('[data-os="demand"]', t.contractDemand ? Number(t.contractDemand).toLocaleString("en-IN") + " kVA" : "—");
    setText('[data-os="admin"]', admin ? S.fullName(admin) + " · " + admin.username : "—");
    setText('[data-os="submitted"]', new Date(t.created).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    $$("[data-org-summary]").forEach(function (el) { el.hidden = false; });
  }

  /* ---------------- Account created ---------------- */
  if (byId("register-success")) {
    var orgId = ss.get(LAST_ORG);
    var created = orgId && S.tenant(orgId);
    if (!created) { location.replace("register.html"); return; }
    setText("[data-org-id]", created.id);
    fillOrgSummary(created);
    $("[data-return-login]").addEventListener("click", function () {
      ss.del(LAST_ORG);
      location.href = "login.html";
    });
  }

  /* ---------------- Awaiting approval ----------------
     On login.html / login-approval.html the card is part of the page ([data-inline]):
     signing in to an organisation that isn't active swaps the sign-in card for it,
     and "Return to sign in" swaps back. awaiting-approval.html still works on its own. */
  var awCard = byId("awaiting-approval");
  function fillAwaiting(pt) {
    var title = $(".auth-title", awCard), sub = $("[data-aw-sub]", awCard);
    if (!awCard._defaults) awCard._defaults = { title: title.textContent, sub: sub.textContent };
    title.textContent = awCard._defaults.title;
    sub.textContent = awCard._defaults.sub;
    $$(".progress-steps, .callout", awCard).forEach(function (el) { el.hidden = false; });
    if (!pt) return;
    setText("[data-pending-id]", pt.id);
    $$("[data-pending-chip]", awCard).forEach(function (el) { el.hidden = false; });
    fillOrgSummary(pt);
    if (pt.status === "suspended" || pt.status === "disabled") {
      var why = pt.statusReason ? " Reason: " + pt.statusReason + "." : "";
      var till = pt.suspendedUntil ? new Date(pt.suspendedUntil).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      title.textContent = pt.status === "disabled" ? "Organisation disabled" : "Organisation temporarily suspended";
      sub.textContent = pt.status === "disabled"
        ? "The platform administrator has disabled this organisation. Contact support to restore access." + why
        : "The platform administrator has suspended this organisation" + (till ? " until " + till + ". Access comes back automatically after that." : ". Contact support to restore access.") + why;
      // Approval steps and "what happens next" don't apply to a blocked organisation
      $$(".progress-steps, .callout", awCard).forEach(function (el) { el.hidden = true; });
    }
  }
  // login.html holds three cards — sign in, approval preview, awaiting approval — and swaps between them in place
  var returnTo = "signin";
  function currentCard() { var c = $$("[data-card]").filter(function (el) { return !el.hidden; })[0]; return c ? c.getAttribute("data-card") : null; }
  function showCard(name) {
    var target = $('[data-card="' + name + '"]');
    if (!target) return false;
    $$("[data-card]").forEach(function (c) { c.hidden = c !== target; });
    window.scrollTo(0, 0);
    var title = $(".auth-title", target); if (title) title.focus();
    var first = $("input:not([type=hidden]):not([type=checkbox])", target);
    if (first && !first.value) first.focus();
    return true;
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-show-card]");
    if (!a || !$('[data-card="' + a.getAttribute("data-show-card") + '"]')) return; // no such card here → follow the link
    e.preventDefault();
    $$(".auth-form").forEach(function (f) { showError(f, ""); });
    showCard(a.getAttribute("data-show-card"));
  });
  function showAwaiting(t) {
    if (!awCard) { ss.set(PENDING_ORG, t.id); location.href = "awaiting-approval.html"; return; }
    fillAwaiting(t);
    returnTo = currentCard() || "signin";
    showCard("awaiting");
  }
  if (awCard) {
    var inline = awCard.hasAttribute("data-inline");
    if (!inline) fillAwaiting(S.tenant(ss.get(PENDING_ORG)));
    $("[data-return-login]", awCard).addEventListener("click", function () {
      ss.del(PENDING_ORG);
      if (!inline) { location.href = "login.html"; return; }
      showCard(returnTo);
      var pw = $('[data-card="' + returnTo + '"] input[type=password]');
      if (pw) { pw.value = ""; pw.focus(); }
    });
  }

  /* ---------------- Forgot Password ---------------- */
  var fpForm = byId("fp-form");
  if (fpForm) {
    var showCard = function (name) { $$("[data-fp-card]").forEach(function (c) { c.hidden = c.getAttribute("data-fp-card") !== name; }); };
    var FP_IDS = ["fp-org", "fp-email"];
    clearOnInput(fpForm, FP_IDS);
    var active = null;

    fpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var org = val("fp-org"), email = val("fp-email");
      if (!org || !email) { markError(FP_IDS, true); return showError(fpForm, "Please fill in both fields."); }
      var u = S.tenant(org) && S.users(S.tenant(org).id).filter(function (x) { return x.email.toLowerCase() === email.toLowerCase(); })[0];
      if (!u || !u.pw) { markError(FP_IDS, true); return showError(fpForm, "No account with that work email is registered in this organisation."); }
      active = u;
      S.startPending("reset", { uid: u.id });
      setText("[data-reset-email]", maskEmail(u.email));
      setText("[data-demo-code]", S.pending("reset").code);
      $("[data-reset-user]").value = u.username; // lets password managers update the right saved login
      showCard("reset");
      setTimeout(function () { $(".otp input").focus(); }, 100);
    });

    var resetForm = byId("reset-form");
    var boxes = $$(".otp input", resetForm);
    clearOnInput(resetForm, ["fp-new", "fp-confirm"]);
    boxes.forEach(function (b) { b.addEventListener("input", function () { markError(["otp"], false); b.classList.remove("is-error"); }); });
    $("[data-resend-code]").addEventListener("click", function () {
      var p = S.resendPending("reset");
      setText("[data-demo-code]", p.code);
      boxes.forEach(function (b) { b.value = ""; b.classList.remove("is-error"); });
      markError(["otp"], false);
      boxes[0].focus();
      var btn = this;
      btn.disabled = true; btn.textContent = "Sent!";
      setTimeout(function () { btn.disabled = false; btn.textContent = "Resend code"; }, 2000);
    });
    resetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = boxes.map(function (b) { return b.value; }).join(""), otpMsg = $('[data-err="otp"]');
      if (code.length < 6) {
        otpMsg.textContent = "Please enter all 6 digits.";
        otpMsg.classList.add("is-shown");
        boxes.forEach(function (b) { if (!b.value) b.classList.add("is-error"); });
        return;
      }
      var res = S.checkCode("reset", code);
      if (res !== "ok") {
        otpMsg.textContent = res === "wrong" ? "Incorrect code. Please try again." : res === "locked" ? "Too many attempts. Resend a new code." : "This code has expired. Resend a new code.";
        otpMsg.classList.add("is-shown");
        boxes.forEach(function (b) { b.value = ""; b.classList.add("is-error"); });
        boxes[0].focus();
        return;
      }
      var pw = byId("fp-new").value, lengthOk = passwordOk(pw), matchOk = lengthOk && pw === byId("fp-confirm").value;
      markError(["fp-new"], !lengthOk);
      markError(["fp-confirm"], !matchOk);
      if (!lengthOk || !matchOk) return;
      S.setPassword(active, pw);
      S.clearPending("reset");
      showCard("success");
    });
  }

  /* ---------------- Accept invitation (energy app: users invited from the Users page) ---------------- */
  var inviteForm = byId("invite-form");
  if (inviteForm) {
    var iu = S.findInvite(q.token);
    if (iu && (!S.tenant(iu.org) || S.tenant(iu.org).status !== "active")) iu = null; // organisation pending/suspended
    if (!iu) {
      $$("[data-when-pending]").forEach(function (el) { el.hidden = true; });
      $$("[data-when-none]").forEach(function (el) { el.hidden = false; });
    } else {
      var it = S.tenant(iu.org);
      var by = iu.invite.by && S.user(iu.invite.by);
      setText('[data-inv="org"]', it.name);
      setText('[data-inv="initials"]', S.initials(it.name));
      setText('[data-inv="orgid"]', it.id);
      setText('[data-inv="by"]', by ? S.fullName(by) : "your administrator");
      setText('[data-inv="role"]', iu.role);
      setText('[data-inv="shift"]', iu.shift);
      byId("inv-first").value = iu.first;
      byId("inv-last").value = iu.last;
      byId("inv-email").value = iu.username;
      setText('[data-inv="email"]', iu.email);
      byId("inv-mobile").value = iu.mobile || "";
      inviteForm.addEventListener("submit", function (e) {
        e.preventDefault();
        S.acceptInvite(iu, { first: val("inv-first"), last: val("inv-last"), mobile: val("inv-mobile"), password: byId("inv-password").value });
        S.signIn(iu, false);
        location.href = "dashboard.html?joined=1";
      });
    }
  }
})();
