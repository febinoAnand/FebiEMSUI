/* ==========================================================================
   Energy Dashboard — Control Center (platform admin, demo mode)
   Pending sign-ups: View · Approve (pending → active) · Reject (deletes the request)
   All tenants: View · Suspend / Reactivate · Delete
   ========================================================================== */
(function () {
  var S = window.EDStore;
  if (!S.adminSession()) return; // app.js already redirected to admin-login
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var STATUS = { active: ["success", "Active"], pending: ["warn", "Pending"], suspended: ["danger", "Suspended"] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function date(ts) { return ts ? new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
  function adminOf(t) {
    var list = S.users(t.id);
    return list.filter(function (u) { return u.role === "Tenant Admin"; })[0] || list[0] || null;
  }
  function kva(n) { return n ? Number(n).toLocaleString("en-IN") + " kVA" : "—"; }
  function badge(st) { var s = STATUS[st] || STATUS.pending; return '<span class="badge badge--' + s[0] + '"><span class="dot"></span> ' + s[1] + "</span>"; }
  function orgCell(t) {
    return '<div class="cell-user"><span class="tenant-switch__logo">' + esc(S.initials(t.name)) + '</span><div><strong>' + esc(t.name) +
      '</strong><small class="mono">' + esc(t.id) + "</small></div></div>";
  }
  function btn(action, id, label, cls) {
    return '<button type="button" class="btn btn--sm ' + (cls || "") + '" data-action="' + action + '" data-id="' + esc(id) + '">' + label + "</button>";
  }
  // Compact icon action (same look as the Users table actions)
  function act(action, id, icon, title, cls) {
    return '<button type="button" class="act ' + cls + '" title="' + title + '" aria-label="' + title + '" data-action="' + action + '" data-id="' + esc(id) + '"><i class="ic ' + icon + '"></i></button>';
  }

  var toastTimer;
  function toast(title, text, danger) {
    var t = byId("admin-toast");
    t.classList.toggle("toast--danger", !!danger);
    $("[data-toast-title]", t).textContent = title;
    $("[data-toast-text]", t).textContent = text;
    t.classList.remove("is-shown");
    void t.offsetWidth; // restart the animation
    t.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-shown"); }, 4000);
  }

  function render() {
    var all = S.tenants();
    var count = function (st) { return all.filter(function (t) { return t.status === st; }).length; };
    var users = all.reduce(function (n, t) { return n + S.users(t.id).length; }, 0);
    var set = function (k, v) { $$('[data-stat="' + k + '"]').forEach(function (el) { el.textContent = v; }); };
    set("pending", count("pending"));
    set("pending-badge", count("pending"));
    set("active", count("active"));
    set("suspended", count("suspended"));

    // Pending requests (oldest first)
    var pending = all.filter(function (t) { return t.status === "pending"; }).reverse();
    byId("pending-rows").innerHTML = pending.map(function (t) {
      var a = adminOf(t);
      return "<tr>" +
        '<td><div class="cell-user"><span class="tenant-switch__logo">' + esc(S.initials(t.name)) + "</span><strong>" + esc(t.name) + "</strong></div></td>" +
        "<td>" + esc(t.industry || "—") + "</td>" +
        '<td><div class="cell-user" style="min-width:0"><div><strong>' + esc(t.city || "—") + "</strong><small>" + esc(t.discom || "") + "</small></div></div></td>" +
        '<td class="num">' + esc(t.meters || "—") + "</td>" +
        '<td class="num">' + kva(t.contractDemand) + "</td>" +
        '<td class="nowrap">' + date(t.created) + "</td>" +
        '<td><div class="row" style="gap:6px;flex-wrap:nowrap">' + btn("view", t.id, "View") + btn("approve", t.id, "Approve", "btn--primary") +
        btn("reject", t.id, "Reject", "tc-rose") + "</div></td></tr>";
    }).join("");
    byId("pending-empty").hidden = pending.length > 0;
    byId("pending-rows").closest(".table-wrap").hidden = pending.length === 0;

    // All tenants, filtered
    var q = byId("tf-search").value.trim().toLowerCase(), st = byId("tf-status").value;
    var rows = all.filter(function (t) {
      if (st && t.status !== st) return false;
      if (!q) return true;
      var a = adminOf(t);
      return [t.name, t.id, t.contact, t.city, t.discom, t.industry, a && a.email, a && a.username].join(" ").toLowerCase().indexOf(q) > -1;
    });
    byId("tenant-rows").innerHTML = rows.length ? rows.map(function (t) {
      var toggle = t.status === "active" ? btn("suspend", t.id, '<i class="ic i-lock"></i> Suspend', "btn--ghost tc-rose")
        : t.status === "pending" ? btn("approve", t.id, '<i class="ic i-check"></i> Approve', "btn--primary")
        : btn("activate", t.id, '<i class="ic i-refresh"></i> Reactivate', "btn--soft");
      var remove = t.status === "pending" ? act("reject", t.id, "i-x", "Reject request", "act--del") : act("delete", t.id, "i-trash", "Delete tenant", "act--del");
      return '<tr class="' + (t.status === "suspended" ? "is-muted" : "") + '">' +
        "<td>" + orgCell(t) + "</td><td>" + badge(t.status) + "</td>" +
        "<td>" + esc(t.industry || "—") + "</td>" +
        '<td class="num">' + esc(t.meters || "—") + "</td>" +
        '<td class="num">' + S.users(t.id).length + "</td>" +
        '<td class="small muted nowrap">' + date(t.created) + "</td>" +
        '<td><div class="actions">' + act("view", t.id, "i-eye", "View details", "act--view") + toggle + remove + "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="center muted" style="padding:32px 16px">No tenants match these filters.</td></tr>';
  }

  function view(t) {
    var m = byId("tenant-view"), a = adminOf(t);
    $('[data-tv="name"]', m).textContent = t.name;
    // "Signup Details": what the organisation submitted when registering (+ status)
    var fields = [
      ["Organisation ID", '<span class="mono">' + esc(t.id) + "</span>"], ["Status", badge(t.status)],
      ["Facility type", esc(t.industry || "—")], ["Site location", esc(t.city || "—")], ["Electricity provider", esc(t.discom || "—")],
      ["Contract demand", '<span class="mono">' + kva(t.contractDemand) + "</span>"], ["Energy meters", esc(t.meters ? t.meters + " meters" : "—")],
      ["Administrator", esc(a ? S.fullName(a) : "—")], ["Username", '<span class="mono">' + esc(a ? a.username : "—") + "</span>"],
      ["Work email", esc(a ? a.email : t.contact || "—")], ["Mobile", '<span class="mono">' + esc((a && a.mobile) || t.phone || "—") + "</span>"],
      ["Requested", date(t.created)], ["Users", S.users(t.id).length],
    ];
    $('[data-tv="details"]', m).innerHTML = fields.map(function (f) { return "<dt>" + f[0] + "</dt><dd>" + f[1] + "</dd>"; }).join("");
    var actions = '';
    if (t.status === "pending") actions += btn("approve", t.id, '<i class="ic i-check"></i> Approve', "btn--primary") + btn("reject", t.id, '<i class="ic i-x"></i> Reject', "tc-rose");
    else if (t.status === "active") actions += btn("suspend", t.id, '<i class="ic i-lock"></i> Suspend', "btn--danger");
    else actions += btn("activate", t.id, '<i class="ic i-refresh"></i> Reactivate', "btn--primary");
    $('[data-tv="actions"]', m).innerHTML = actions + '<a href="#close" class="btn">Close</a>';
    location.hash = "tenant-view";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-action]");
    if (!b) return;
    var t = S.tenant(b.getAttribute("data-id"));
    if (!t) return;
    var action = b.getAttribute("data-action");
    if (action === "view") return view(t);
    if (action === "approve") {
      S.setTenantStatus(t.id, "active");
      toast("Tenant approved", t.name + " has been approved.");
    } else if (action === "reject") {
      if (!window.confirm('Reject the signup request from "' + t.name + '"? This cannot be undone.')) return;
      S.deleteTenant(t.id);
      toast("Request rejected", t.name + "'s signup request has been rejected.", true);
    } else if (action === "suspend") {
      if (!window.confirm('Suspend "' + t.name + '"? None of its ' + S.users(t.id).length + " users will be able to sign in until it's reactivated.")) return;
      S.setTenantStatus(t.id, "suspended");
      toast("Tenant suspended", t.name + " is blocked from signing in.", true);
    } else if (action === "activate") {
      S.setTenantStatus(t.id, "active");
      toast("Tenant reactivated", t.name + " can sign in again.");
    } else if (action === "delete") {
      var typed = window.prompt('Type the Organisation ID (' + t.id + ') to permanently delete "' + t.name + '" and all of its users.');
      if (typed == null) return;
      if (typed.trim().toUpperCase() !== t.id) { toast("Not deleted", "The Organisation ID didn't match.", true); return; }
      S.deleteTenant(t.id);
      toast("Tenant deleted", t.name + " and its users were removed.", true);
    }
    if (location.hash === "#tenant-view") location.hash = "close";
    render();
  });

  byId("tf-search").addEventListener("input", render);
  byId("tf-status").addEventListener("change", render);
  $$("[data-admin-signout]").forEach(function (a) { a.addEventListener("click", function () { S.adminSignOut(); }); });
  var admin = S.adminSession();
  $$("[data-admin-name]").forEach(function (el) { el.textContent = admin.name || admin.username; });
  // Keep the sidebar highlight in step with the section links
  $$(".nav__link").forEach(function (a) {
    a.addEventListener("click", function () { $$(".nav__link").forEach(function (x) { x.classList.toggle("is-active", x === a); }); });
  });
  window.addEventListener("storage", render); // approvals made in another tab
  render();
})();
