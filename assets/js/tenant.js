/* ==========================================================================
   Energy Dashboard — Control Center: individual tenant page (tenant.html?id=FEBINO)
   Platform admin only. Shows the organisation, its site details, administrator,
   users and status history, with Approve / Reject / Suspend / Reactivate / Delete.
   ========================================================================== */
(function () {
  var S = window.EDStore;
  if (!S.adminSession()) return; // app.js already redirected to admin-login
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var page = document.getElementById("tenant-page");
  var id = (new URLSearchParams(location.search).get("id") || "").toUpperCase();

  var STATUS = { active: ["success", "Active"], pending: ["warn", "Pending approval"], suspended: ["warn", "Suspended"], disabled: ["danger", "Disabled"] };
  function until(ts) {
    if (!ts) return "";
    var days = Math.ceil((ts - Date.now()) / 864e5);
    return dateTime(ts) + (days > 1 ? " (" + days + " days left)" : days === 1 ? " (less than a day left)" : "");
  }
  var USTATUS = { active: "success", invited: "info", inactive: "warn", suspended: "danger" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function date(ts) { return ts ? new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"; }
  function dateTime(ts) { return ts ? new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
  function badge(st) { var s = STATUS[st] || STATUS.pending; return '<span class="badge badge--' + s[0] + '"><span class="dot' + (st === "active" ? " dot--live" : "") + '"></span> ' + s[1] + "</span>"; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var toastTimer;
  function toast(title, text, danger) {
    var t = document.getElementById("admin-toast");
    t.classList.toggle("toast--danger", !!danger);
    $("[data-toast-title]", t).textContent = title;
    $("[data-toast-text]", t).textContent = text;
    t.classList.remove("is-shown"); void t.offsetWidth; t.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-shown"); }, 4000);
  }

  function render() {
    var t = S.tenant(id);
    if (!t) {
      page.innerHTML = '<section class="card" style="max-width:560px;margin:40px auto"><div class="card__body center"><span class="icon-tile icon-tile--amber auth-icon auth-icon--round"><i class="ic i-alert"></i></span><h2 class="page-title" style="font-size:22px">Tenant not found</h2><p class="page-sub">' +
        (id ? "No organisation with ID <b class=\"mono\">" + esc(id) + "</b> — it may have been rejected or deleted." : "Open a tenant from the Control Center.") +
        '</p><a href="tenants.html" class="btn btn--primary" style="margin-top:18px"><i class="ic i-arrow-left"></i> All tenants</a></div></section>';
      return;
    }
    document.title = t.name + " · Control Center";
    var crumb = $(".topbar__crumbs strong");
    if (crumb) crumb.textContent = t.name;

    var users = S.users(t.id);
    var admins = users.filter(function (u) { return u.role === "Tenant Admin"; });
    var admin = admins[0] || users[0] || null;
    var count = function (st) { return users.filter(function (u) { return u.status === st; }).length; };
    var lastActive = users.reduce(function (m, u) { return Math.max(m, u.lastActive || 0); }, 0);
    var used = S.usage(t.id, "meters"), limit = S.limit(t.id, "meters");

    // Header + actions for the current status
    var actions = '<a href="tenants.html" class="btn btn--sm"><i class="ic i-arrow-left"></i> All tenants</a>';
    if (t.status === "pending") actions += btn("reject", '<i class="ic i-x"></i> Reject', "tc-rose") + btn("approve", '<i class="ic i-check"></i> Approve', "btn--primary");
    else if (t.status === "active") actions += btn("delete", '<i class="ic i-trash"></i> Delete', "tc-rose") + btn("disable", '<i class="ic i-lock"></i> Disable', "tc-rose") +
      '<a href="#suspend-tenant" class="btn btn--sm btn--danger" data-suspend-open><i class="ic i-clock"></i> Suspend temporarily</a>';
    else if (t.status === "suspended") actions += btn("delete", '<i class="ic i-trash"></i> Delete', "tc-rose") +
      '<a href="#suspend-tenant" class="btn btn--sm" data-suspend-open><i class="ic i-calendar"></i> Change period</a>' + btn("enable", '<i class="ic i-check"></i> Enable now', "btn--primary");
    else actions += btn("delete", '<i class="ic i-trash"></i> Delete', "tc-rose") + btn("enable", '<i class="ic i-check"></i> Enable', "btn--primary");

    var html = '<section class="page-head"><div class="meter-head">' +
      '<span class="tenant-switch__logo" style="width:54px;height:54px;border-radius:16px;font-size:18px">' + esc(S.initials(t.name)) + "</span>" +
      '<div style="min-width:0"><span class="eyebrow">Tenant · ' + esc(t.industry || "Organisation") + "</span>" +
      '<h1 class="page-title" style="margin-top:2px">' + esc(t.name) + "</h1>" +
      '<div class="meter-meta"><span class="tag">' + esc(t.id) + "</span>" + badge(t.status) +
      '<span class="page-sub" style="margin:0">' + (t.status === "suspended" && t.suspendedUntil ? "Suspended until " + dateTime(t.suspendedUntil) : "Registered " + date(t.created) + (t.approvedAt ? " · approved " + date(t.approvedAt) : "")) + "</span></div></div></div>" +
      '<div class="page-actions">' + actions + "</div></section>";

    if (t.status === "pending") html += '<div class="callout callout--warn"><i class="ic i-clock"></i><span><b>Waiting for your approval.</b> Nobody in this organisation can sign in until it is approved. Check the site and administrator details below.</span></div>';
    var who = users.length === 1 ? "Its only user is" : "All " + users.length + " users of this organisation are";
    var why = t.statusReason ? " <b>Reason:</b> " + esc(t.statusReason) + "." : "";
    if (t.status === "suspended") html += '<div class="callout callout--warn"><i class="ic i-clock"></i><span><b>Temporarily suspended' + (t.suspendedUntil ? " until " + esc(until(t.suspendedUntil)) : "") + ".</b> " + who + " blocked from signing in. Access comes back automatically " + (t.suspendedUntil ? "when the period ends" : "once you enable it") + ", or use <b>Enable now</b>." + why + "</span></div>";
    if (t.status === "disabled") html += '<div class="callout callout--danger"><i class="ic i-lock"></i><span><b>Disabled.</b> ' + who + " blocked from signing in until you enable this organisation." + why + "</span></div>";

    var tile = function (icon, c, v, label, foot) {
      return '<div class="card stat"><span class="stat__icon" style="--c:var(' + c + ')"><i class="ic ' + icon + '"></i></span><div><strong>' + v + "</strong><span>" + label + "</span>" + (foot ? '<div class="small muted" style="margin-top:2px">' + foot + "</div>" : "") + "</div></div>";
    };
    html += '<section class="grid grid-4">' +
      tile("i-users", "--blue", users.length, "Users", count("active") + " active · " + count("invited") + " invited") +
      tile("i-gauge", "--cyan", used + ' <small class="muted" style="font-size:13px">/ ' + (limit ? limit : "∞") + "</small>", "Energy meters", limit ? Math.max(limit - used, 0) + " left under the limit" : "No meter limit") +
      tile("i-bolt", "--amber", t.contractDemand ? Number(t.contractDemand).toLocaleString("en-IN") + ' <small class="muted" style="font-size:13px">kVA</small>' : "—", "Contract demand", esc(t.discom || "")) +
      tile("i-activity", "--green", lastActive ? S.timeAgo(lastActive) : "Never", "Last sign-in", lastActive ? "by any user" : "no user has signed in yet") +
      "</section>" + limitsCard(t);

    var kv = function (rows) { return '<dl class="kv">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>"; };
    html += '<section class="grid grid-2">' +
      '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-building"></i> Organisation &amp; site</h3><p class="card__sub">As submitted at registration</p></div></div><div class="card__body">' +
      kv([["Organisation ID", '<span class="mono">' + esc(t.id) + "</span>"], ["Name", esc(t.name)], ["Facility type", esc(t.industry || "—")],
        ["Site location", esc(t.city || t.address || "—")], ["Electricity provider", esc(t.discom || "—")],
        ["Contract demand", t.contractDemand ? Number(t.contractDemand).toLocaleString("en-IN") + " kVA" : "—"], ["Energy meters (declared)", esc(t.meters ? t.meters + " meters" : "—")],
        ["Contact email", esc(t.contact || "—")], ["Contact phone", '<span class="mono">' + esc(t.phone || "—") + "</span>"],
        ["Plan", esc(((S.PLANS[t.plan] || {}).name || "—") + " · " + (t.cycle || ""))], ["Time zone", esc(t.timezone || "—")]]) +
      "</div></div>" +
      '<div class="stack">' +
      '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-shield"></i> Administrator</h3><p class="card__sub">' + (admins.length > 1 ? admins.length + " Tenant Admins · showing the first" : "Tenant Admin account") + "</p></div></div><div class=\"card__body\">" +
      (admin ? kv([["Name", esc(S.fullName(admin))], ["Username", '<span class="mono">' + esc(admin.username) + "</span>"], ["Work email", esc(admin.email)],
        ["Mobile", '<span class="mono">' + esc(admin.mobile || "—") + "</span>"], ["Status", '<span class="badge badge--' + (USTATUS[admin.status] || "info") + '">' + cap(admin.status) + "</span>"],
        ["Last active", admin.lastActive ? S.timeAgo(admin.lastActive) : "Never"]]) : '<p class="muted small">No administrator account.</p>') +
      "</div></div>" +
      '<div class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-clock"></i> Timeline</h3><p class="card__sub">Registration and status changes</p></div></div><div class="card__body"><div class="timeline">' + timeline(t) + "</div></div></div>" +
      "</div></section>";

    // Users
    html += '<section class="card"><div class="card__head"><div><h3 class="card__title"><i class="ic i-users"></i> Users (' + users.length + ')</h3><p class="card__sub">Everyone with an account in ' + esc(t.name) + " · read-only here; the tenant's admin manages users</p></div></div>" +
      '<div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last active</th></tr></thead><tbody>' +
      (users.length ? users.slice().sort(function (a, b) { return (a.role === "Tenant Admin" ? 0 : 1) - (b.role === "Tenant Admin" ? 0 : 1) || (b.lastActive || 0) - (a.lastActive || 0); }).map(function (u) {
        return '<tr><td><div class="cell-user"><span class="avatar av-' + (u.username.length % 6 + 1) + '">' + esc(S.initials(S.fullName(u))) + "</span><div><strong>" + esc(S.fullName(u)) +
          ' <span class="tag" style="margin-left:4px">' + esc(u.username) + "</span></strong><small>" + esc(u.email) + "</small></div></div></td>" +
          "<td>" + esc(u.role) + "</td><td>" + esc(u.dept || "—") + '</td><td><span class="badge badge--' + (USTATUS[u.status] || "info") + '">' + cap(u.status) + "</span></td>" +
          '<td class="small muted nowrap">' + (u.status === "invited" ? "Invited" : S.timeAgo(u.lastActive)) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="center muted" style="padding:28px">No users.</td></tr>') +
      "</tbody></table></div></section>";

    page.innerHTML = html;
    var pb = document.querySelector('[data-stat="pending-badge"]');
    if (pb) pb.textContent = S.tenants().filter(function (x) { return x.status === "pending"; }).length;
  }

  function limitsCard(t) {
    var rows = S.limits(t.id), full = rows.filter(function (r) { return r.full; });
    var plan = (S.PLANS[t.plan] || {}).name || "—";
    return '<section class="card" id="limits"><div class="card__head"><div><h3 class="card__title"><i class="ic i-sliders"></i> Limits</h3>' +
      '<p class="card__sub">How much ' + esc(t.name) + " can set up · defaults come from the " + esc(plan) + " plan, override any of them</p></div>" +
      (full.length ? '<span class="badge badge--danger"><span class="dot"></span> ' + full.length + " at limit</span>" : '<span class="badge badge--success"><span class="dot"></span> All within limits</span>') + "</div>" +
      '<div class="table-wrap"><table class="table limits-table"><thead><tr><th>Resource</th><th class="num">In use</th><th>Usage</th><th>Limit</th><th>Unlimited</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var pct = r.limit ? Math.min(100, Math.round(r.used / r.limit * 100)) : 0;
        var tone = !r.limit ? "" : r.full ? " bar--rose" : pct >= 80 ? " bar--amber" : "";
        var state = !r.limit ? '<small class="muted">No limit</small>'
          : r.over ? '<small class="tc-rose">Over by ' + (r.used - r.limit) + "</small>"
          : r.full ? '<small class="tc-rose">Limit reached</small>' : "<small>" + (r.limit - r.used) + " left</small>";
        return '<tr data-limit-row="' + r.key + '"><td><div class="cell-user"><span class="icon-tile" style="width:34px;height:34px"><i class="ic ' + r.icon + '"></i></span><div><strong>' + esc(r.label) + "</strong><small>" + esc(r.hint) + "</small></div></div></td>" +
          '<td class="num mono">' + r.used + "</td>" +
          '<td><div class="bar-cell">' + (r.limit ? '<div class="bar' + tone + '"><span style="--w:' + pct + '%"></span></div>' : "") + state + "</div></td>" +
          '<td><input type="number" class="input input--sm mono limits-input" min="1" max="100000" step="1" data-limit-input="' + r.key + '" value="' + (r.limit || "") + '"' + (r.limit ? "" : " disabled") + ' aria-label="' + esc(r.label) + ' limit" />' +
          '<small class="muted limits-src">' + (r.custom ? 'Custom · <button type="button" class="linklike" data-limit-default="' + r.key + '">plan default (' + (r.def || "unlimited") + ")</button>" : "Plan default") + "</small></td>" +
          '<td><label class="switch"><input type="checkbox" data-limit-unlimited="' + r.key + '"' + (r.limit ? "" : " checked") + ' aria-label="Unlimited ' + esc(r.label) + '" /></label></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<div class="card__foot row wrap" style="gap:12px"><input id="lim-reason" class="input input--sm" style="flex:1;min-width:220px" placeholder="Reason for the change (optional) · e.g. Upgraded to Enterprise" aria-label="Reason for the change" />' +
      btn("reset-limits", '<i class="ic i-refresh"></i> All plan defaults', "btn--ghost") + btn("save-limits", '<i class="ic i-check"></i> Save limits', "btn--primary") +
      '<span class="field-error" id="lim-error" style="flex-basis:100%"></span></div></section>';
  }

  function btn(action, label, cls) { return '<button type="button" class="btn btn--sm ' + (cls || "") + '" data-action="' + action + '">' + label + "</button>"; }

  function timeline(t) {
    var items = [["Registered and email verified", t.created, "--primary"]];
    if (t.history && t.history.length) {
      // Approvals made before status history existed are only in approvedAt
      if (t.approvedAt && !t.history.some(function (h) { return h.from === "pending"; })) items.push(["Approved by platform admin", t.approvedAt, "--green"]);
      t.history.forEach(function (h) {
        var label = h.to === "active" ? (h.from === "pending" ? "Approved by platform admin" : h.auto ? "Suspension ended automatically" : "Enabled by platform admin")
          : h.to === "suspended" ? (h.from === "suspended" ? "Suspension changed" : "Suspended") + (h.until ? " until " + dateTime(h.until) : "")
          : h.to === "disabled" ? "Disabled by platform admin" : "Set to " + h.to;
        if (h.reason) label += " — " + h.reason;
        items.push([label, h.at, h.to === "disabled" ? "--rose" : h.to === "suspended" ? "--amber" : "--green"]);
      });
    } else {
      if (t.approvedAt) items.push(["Approved by platform admin", t.approvedAt, "--green"]);
      if (t.status === "suspended" || t.status === "disabled") items.push([t.status === "suspended" ? "Suspended" : "Disabled", null, "--rose"]);
    }
    var labels = {};
    S.LIMITS.forEach(function (d) { labels[d.key] = d.label; });
    (t.limitHistory || []).forEach(function (h) {
      var lim = function (n) { return n ? String(n) : "unlimited"; };
      items.push([(labels[h.key || "meters"] || h.key) + " limit " + lim(h.from) + " → " + lim(h.to) + (h.reset ? " (plan default)" : "") + (h.reason ? " — " + h.reason : ""), h.at, "--cyan"]);
    });
    items.sort(function (a, b) { return (a[1] || Infinity) - (b[1] || Infinity); });
    if (t.status === "pending") items.push(["Waiting for approval", null, "--amber"]);
    return items.map(function (i) {
      return '<div class="timeline__item" style="--c:var(' + i[2] + ')"><strong>' + esc(i[0]) + "</strong><time>" + (i[1] ? dateTime(i[1]) : "Now") + "</time></div>";
    }).join("");
  }

  document.addEventListener("click", function (e) {
    var d = e.target.closest && e.target.closest("[data-limit-default]");
    if (!d) return;
    var patch = {};
    patch[d.getAttribute("data-limit-default")] = null;
    S.setLimits(id, patch, "");
    toast("Limit reset", "Back to the plan default.");
    render();
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-action]");
    if (!b || !(page.contains(b) || b.closest("#suspend-tenant"))) return;
    var t = S.tenant(id);
    if (!t) return;
    var a = b.getAttribute("data-action");
    if (a === "save-limits" || a === "reset-limits") {
      var err = document.getElementById("lim-error"), patch = {}, bad = null, below = [];
      err.classList.remove("is-shown");
      if (a === "reset-limits") {
        if (!window.confirm("Put every limit for " + t.name + " back to its " + ((S.PLANS[t.plan] || {}).name || "plan") + " plan default?")) return;
        S.LIMITS.forEach(function (d) { patch[d.key] = null; });
      } else {
        S.limits(t.id).forEach(function (r) {
          var unl = document.querySelector('[data-limit-unlimited="' + r.key + '"]').checked;
          var inp = document.querySelector('[data-limit-input="' + r.key + '"]'), n = Number(inp.value);
          if (!unl && (!inp.value || n < 1 || n % 1 !== 0 || n > 100000)) { bad = bad || inp; return; }
          var next = unl ? 0 : n;
          if (next !== r.limit) { patch[r.key] = next; if (next && next < r.used) below.push(r.label + " (" + r.used + " in use, limit " + next + ")"); }
        });
        if (bad) { err.textContent = "Enter a whole number from 1 to 100,000 for each limit, or tick Unlimited."; err.classList.add("is-shown"); bad.focus(); return; }
        if (!Object.keys(patch).length) { toast("No changes", "The limits are already set like this."); return; }
        if (below.length && !window.confirm("These limits are below what " + t.name + " already uses:\n\n• " + below.join("\n• ") + "\n\nExisting items keep working, but nothing new can be added until usage is under the limit. Continue?")) return;
      }
      S.setLimits(t.id, patch, document.getElementById("lim-reason").value.trim());
      var n = Object.keys(patch).length;
      toast("Limits saved", a === "reset-limits" ? "All limits are back to the plan defaults." : n + " limit" + (n === 1 ? "" : "s") + " updated for " + t.name + ".");
    }
    else if (a === "approve") { S.setTenantStatus(t.id, "active"); toast("Tenant approved", t.name + " can now sign in."); }
    else if (a === "enable") { S.setTenantStatus(t.id, "active"); toast("Tenant enabled", t.name + " can sign in again."); }
    else if (a === "disable") {
      var reason = window.prompt('Disable "' + t.name + '"? None of its ' + S.users(t.id).length + " users will be able to sign in until you enable it again.\n\nReason (optional):", "");
      if (reason === null) return;
      S.setTenantStatus(t.id, "disabled", { reason: reason.trim() });
      toast("Tenant disabled", t.name + " is blocked until you enable it.", true);
    } else if (a === "confirm-suspend") {
      var end = new Date(document.getElementById("sus-until").value).getTime();
      var err = document.getElementById("sus-error");
      if (!end || isNaN(end) || end <= Date.now() + 6e4) { err.hidden = false; return; }
      err.hidden = true;
      S.setTenantStatus(t.id, "suspended", { until: end, reason: document.getElementById("sus-reason").value.trim() });
      location.hash = "close";
      toast("Tenant suspended", t.name + " is blocked until " + dateTime(end) + ".", true);
    } else if (a === "reject" || a === "delete") {
      if (a === "reject") {
        if (!window.confirm('Reject the signup request from "' + t.name + '"? This cannot be undone.')) return;
      } else {
        var typed = window.prompt('Type the Organisation ID (' + t.id + ') to permanently delete "' + t.name + '" and all of its users.');
        if (typed == null) return;
        if (typed.trim().toUpperCase() !== t.id) { toast("Not deleted", "The Organisation ID didn't match.", true); return; }
      }
      S.deleteTenant(t.id);
      location.href = "tenants.html";
      return;
    }
    render();
  });

  /* ---------- Suspend temporarily dialog ---------- */
  function pad(n) { return ("0" + n).slice(-2); }
  function toLocalInput(ts) { var d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function setPeriod() {
    var sel = document.getElementById("sus-period"), inp = document.getElementById("sus-until");
    if (!sel || sel.value === "custom") return;
    inp.value = toLocalInput(Date.now() + Number(sel.value) * 864e5);
  }
  function openSuspend() {
    var t = S.tenant(id);
    if (!t) return;
    document.getElementById("sus-name").textContent = t.name + " · " + t.id;
    document.getElementById("sus-until").min = toLocalInput(Date.now() + 6e4);
    document.getElementById("sus-reason").value = t.status === "suspended" ? t.statusReason || "" : "";
    document.getElementById("sus-error").hidden = true;
    if (t.status === "suspended" && t.suspendedUntil) { document.getElementById("sus-period").value = "custom"; document.getElementById("sus-until").value = toLocalInput(t.suspendedUntil); }
    else { document.getElementById("sus-period").value = "3"; setPeriod(); }
  }
  document.addEventListener("change", function (e) {
    var key = e.target.getAttribute && e.target.getAttribute("data-limit-unlimited");
    if (key) {
      var i = document.querySelector('[data-limit-input="' + key + '"]');
      i.disabled = e.target.checked;
      if (!e.target.checked) { if (!i.value) i.value = Math.max(S.usage(id, key), 10); i.focus(); }
    }
    if (e.target.id === "sus-period") setPeriod();
    if (e.target.id === "sus-until") document.getElementById("sus-period").value = "custom";
  });
  window.addEventListener("hashchange", function () { if (location.hash === "#suspend-tenant") openSuspend(); });
  if (location.hash === "#suspend-tenant") setTimeout(openSuspend, 0);

  // Sidebar: signed-in admin + sign out (same as the Control Center list)
  var admin = S.adminSession();
  Array.prototype.forEach.call(document.querySelectorAll("[data-admin-name]"), function (el) { el.textContent = admin.name || admin.username; });
  Array.prototype.forEach.call(document.querySelectorAll("[data-admin-signout]"), function (a) { a.addEventListener("click", function () { S.adminSignOut(); }); });

  render();
  window.addEventListener("storage", render); // changes made in another tab
})();
