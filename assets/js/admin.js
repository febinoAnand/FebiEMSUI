/* ==========================================================================
   Energy Dashboard — Control Center (platform admin, demo mode)
   Pending sign-ups: View · Approve (pending → active) · Reject (deletes the request)
   All tenants: View · Suspend (temporary, on the tenant page) / Enable · Delete
   ========================================================================== */
(function () {
  var S = window.EDStore;
  if (!S.adminSession()) return; // app.js already redirected to admin-login
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var STATUS = { active: ["success", "Active"], pending: ["warn", "Pending"], suspended: ["warn", "Suspended"], disabled: ["danger", "Disabled"] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function date(ts) { return ts ? new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
  function adminOf(t) {
    var list = S.users(t.id);
    return list.filter(function (u) { return u.role === "Tenant Admin"; })[0] || list[0] || null;
  }
  function kva(n) { return n ? Number(n).toLocaleString("en-IN") + " kVA" : "—"; }
  function badge(st, t) {
    var s = STATUS[st] || STATUS.pending;
    var till = st === "suspended" && t && t.suspendedUntil ? '<div class="small muted" style="margin-top:3px">until ' + date(t.suspendedUntil) + "</div>" : "";
    return '<span class="badge badge--' + s[0] + '"><span class="dot"></span> ' + s[1] + "</span>" + till;
  }
  // Suspending picks a period on the tenant page (tenant.html#suspend-tenant)
  function suspendLink(t, cls) { return '<a href="tenant.html?id=' + encodeURIComponent(t.id) + '#suspend-tenant" class="btn btn--sm ' + cls + '"><i class="ic i-clock"></i> Suspend…</a>'; }
  function orgCell(t, withFacility) {
    return '<div class="cell-user"><span class="tenant-switch__logo">' + esc(S.initials(t.name)) + '</span><div>' + tenantLink(t) +
      '<small><span class="mono">' + esc(t.id) + "</span>" + (withFacility && t.industry ? " · " + esc(t.industry) : "") + "</small></div></div>";
  }
  // Each tenant has its own page (tenant.html?id=…)
  function tenantLink(t) { return '<a href="tenant.html?id=' + encodeURIComponent(t.id) + '" class="row-link" title="Open tenant page"><strong>' + esc(t.name) + "</strong></a>"; }
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
    set("suspended", count("suspended") + count("disabled"));
    set("total", all.length);
    set("users", users);

    // Pending requests (oldest first) — Approvals page
    var pending = all.filter(function (t) { return t.status === "pending"; }).reverse();
    if (byId("pending-rows")) {
    byId("pending-rows").innerHTML = pending.map(function (t) {
      var a = adminOf(t);
      return "<tr>" +
        '<td><div class="cell-user"><span class="tenant-switch__logo">' + esc(S.initials(t.name)) + "</span>" + tenantLink(t) + "</div></td>" +
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
    }

    // All tenants, filtered — Tenants page
    if (!byId("tenant-rows")) return;
    var q = byId("tf-search").value.trim().toLowerCase(), st = byId("tf-status").value;
    var rows = all.filter(function (t) {
      if (st === "blocked" ? t.status !== "suspended" && t.status !== "disabled" : st && t.status !== st) return false;
      if (!q) return true;
      var a = adminOf(t);
      return [t.name, t.id, t.contact, t.city, t.discom, t.industry, a && a.email, a && a.username].join(" ").toLowerCase().indexOf(q) > -1;
    });
    byId("tenant-rows").innerHTML = rows.length ? rows.map(function (t) {
      var toggle = t.status === "active" ? suspendLink(t, "btn--ghost tc-rose")
        : t.status === "pending" ? btn("approve", t.id, '<i class="ic i-check"></i> Approve', "btn--primary")
        : btn("activate", t.id, '<i class="ic i-check"></i> Enable', "btn--soft");
      var remove = t.status === "pending" ? act("reject", t.id, "i-x", "Reject request", "act--del") : act("delete", t.id, "i-trash", "Delete tenant", "act--del");
      return '<tr class="' + (t.status === "suspended" || t.status === "disabled" ? "is-muted" : "") + '">' +
        "<td>" + orgCell(t, true) + "</td><td>" + badge(t.status, t) + "</td>" +
        '<td><div class="cell-user" style="min-width:0"><div><strong>' + esc(t.city || "—") + "</strong><small>" + esc(t.discom || "") + "</small></div></div></td>" +
        '<td class="num">' + meterCell(t) + "</td>" +
        '<td class="num">' + kva(t.contractDemand) + "</td>" +
        '<td class="num">' + S.users(t.id).length + "</td>" +
        '<td><div class="actions">' + act("view", t.id, "i-eye", "View details", "act--view") + toggle + remove + "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="center muted" style="padding:32px 16px">No tenants match these filters.</td></tr>';
  }

  // "12 / 50" meters used against the tenant's limit (amber ≥ 80%, rose when full)
  function meterCell(t) {
    var used = S.usage(t.id, "meters"), lim = S.limit(t.id, "meters");
    var cls = !lim ? "" : used >= lim ? " tc-rose" : used >= lim * 0.8 ? " tc-amber" : "";
    return '<span class="mono nowrap' + cls + '" title="' + (lim ? used + " of " + lim + " meters used" : "No meter limit") + '">' + used + ' <span class="muted">/ ' + (lim || "∞") + "</span></span>";
  }

  function limitSummary(t) {
    var full = S.limits(t.id).filter(function (r) { return r.full; });
    return full.length ? '<span class="tc-rose">' + full.length + " at limit · " + esc(full.map(function (r) { return r.label; }).join(", ")) + "</span>" : "All within limits";
  }

  function view(t) {
    var m = byId("tenant-view"), a = adminOf(t);
    $('[data-tv="name"]', m).textContent = t.name;
    // "Signup Details": what the organisation submitted when registering (+ status)
    var fields = [
      ["Organisation ID", '<span class="mono">' + esc(t.id) + "</span>"], ["Status", badge(t.status, t)],
      ["Facility type", esc(t.industry || "—")], ["Site location", esc(t.city || "—")], ["Electricity provider", esc(t.discom || "—")],
      ["Contract demand", '<span class="mono">' + kva(t.contractDemand) + "</span>"], ["Energy meters", esc(t.meters ? t.meters + " declared" : "—")], ["Meters / limit", meterCell(t)], ["Limits", limitSummary(t)],
      ["Administrator", esc(a ? S.fullName(a) : "—")], ["Username", '<span class="mono">' + esc(a ? a.username : "—") + "</span>"],
      ["Work email", esc(a ? a.email : t.contact || "—")], ["Mobile", '<span class="mono">' + esc((a && a.mobile) || t.phone || "—") + "</span>"],
      ["Requested", date(t.created)], ["Users", S.users(t.id).length],
    ];
    $('[data-tv="details"]', m).innerHTML = fields.map(function (f) { return "<dt>" + f[0] + "</dt><dd>" + f[1] + "</dd>"; }).join("");
    var actions = '';
    if (t.status === "pending") actions += btn("approve", t.id, '<i class="ic i-check"></i> Approve', "btn--primary") + btn("reject", t.id, '<i class="ic i-x"></i> Reject', "tc-rose");
    else if (t.status === "active") actions += suspendLink(t, "btn--danger");
    else actions += btn("activate", t.id, '<i class="ic i-check"></i> Enable', "btn--primary");
    $('[data-tv="actions"]', m).innerHTML = '<a href="tenant.html?id=' + encodeURIComponent(t.id) + '" class="btn btn--ghost left"><i class="ic i-arrow-right"></i> Open tenant page</a>' + actions + '<a href="#close" class="btn">Close</a>';
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
    } else if (action === "activate") {
      S.setTenantStatus(t.id, "active");
      toast("Tenant enabled", t.name + " can sign in again.");
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

  if (byId("tf-search")) {
    byId("tf-search").addEventListener("input", render);
    byId("tf-status").addEventListener("change", render);
    // Arriving from a link like tenants.html?status=suspended
    var st0 = new URLSearchParams(location.search).get("status");
    if (st0) byId("tf-status").value = st0;
  }
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
