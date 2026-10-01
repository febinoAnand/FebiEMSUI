/* ==========================================================================
   Energy Dashboard — Users page (demo mode, data in store.js)
   Table, stats, search/filters and paging are rendered from the store;
   Invite / View / Edit / Remove modals read and write real records.
   ========================================================================== */
(function () {
  var S = window.EDStore, UI = window.EDUI;
  if (!UI) return; // not signed in
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var me = function () { return UI.session().user; };
  var org = function () { return UI.session().tenant; };

  var PAGE = 6, page = 1, selected = null;
  var ROLE_BADGE = { "Tenant Admin": "violet", "Energy Manager": "success", "Supervisor": "blue", "Operator": "info", "Technician": "orange", "Viewer": "warn", "Auditor": "primary" };
  var SHIFT = { "Shift A": ["a", "i-sun"], "Shift B": ["b", "i-sunset"], "Shift C": ["c", "i-moon"], "General": ["g", "i-clock"] };
  var STATUS = { active: ["success", "Active", true], invited: ["info", "Invited"], inactive: ["warn", "Inactive"], suspended: ["danger", "Suspended"] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function avatarClass(u) { var n = 0; for (var i = 0; i < u.email.length; i++) n += u.email.charCodeAt(i); return "av-" + (n % 6 + 1); }
  function roleBadge(role) { return '<span class="badge badge--' + (ROLE_BADGE[role] || "info") + '"><i class="ic i-shield"></i> ' + esc(role) + "</span>"; }
  function shiftPill(shift) { var s = SHIFT[shift] || SHIFT.General; return '<span class="shift-pill shift--' + s[0] + '"><i class="ic ' + s[1] + '"></i> ' + esc(shift) + "</span>"; }
  function statusBadge(st) { var s = STATUS[st] || STATUS.inactive; return '<span class="badge badge--' + s[0] + '"><span class="dot' + (s[2] ? " dot--live" : "") + '"></span> ' + s[1] + "</span>"; }
  function options(select, list, value) {
    select.innerHTML = list.map(function (x) { return "<option" + (x === value ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
  }

  /* ---------- Table ---------- */
  function filtered() {
    var q = (byId("uf-search").value || "").trim().toLowerCase();
    var role = byId("uf-role").value, shift = byId("uf-shift").value, status = byId("uf-status").value;
    return S.users(org().id).filter(function (u) {
      if (role !== "All roles" && u.role !== role) return false;
      if (shift !== "All shifts" && u.shift !== shift) return false;
      if (status !== "Any status" && u.status !== status.toLowerCase()) return false;
      if (!q) return true;
      return [S.fullName(u), u.email, u.empId, u.username, u.dept].join(" ").toLowerCase().indexOf(q) > -1;
    }).sort(function (a, b) {
      var order = { active: 0, invited: 1, inactive: 2, suspended: 3 };
      return (order[a.status] - order[b.status]) || (a.empId > b.empId ? 1 : -1);
    });
  }
  function render() {
    var list = filtered(), total = list.length, pages = Math.max(1, Math.ceil(total / PAGE));
    page = Math.min(page, pages);
    var rows = list.slice((page - 1) * PAGE, page * PAGE);
    var admin = UI.isAdmin();
    byId("user-rows").innerHTML = rows.length ? rows.map(function (u) {
      var you = u.id === me().id ? ' <span class="badge badge--primary" style="height:20px;font-size:10.5px">You</span>' : "";
      return '<tr data-uid="' + u.id + '">' +
        '<td><div class="cell-user"><span class="avatar ' + avatarClass(u) + '">' + esc(S.initials(S.fullName(u))) + "</span><div><strong>" + esc(S.fullName(u)) +
        ' <span class="tag" style="margin-left:4px" data-field="users.empId">' + esc(u.empId) + "</span>" + you + '</strong><small data-field="users.email">' + esc(u.email) + "</small></div></div></td>" +
        '<td data-field="users.role">' + roleBadge(u.role) + '</td><td data-field="users.shift">' + shiftPill(u.shift) + '</td><td data-field="users.department">' + esc(u.dept || "—") + '</td><td data-field="users.status">' + statusBadge(u.status) + "</td>" +
        '<td class="small muted nowrap">' + (u.status === "invited" ? "Invited " + S.timeAgo(u.invite && u.invite.at).toLowerCase() : S.timeAgo(u.lastActive)) + "</td>" +
        '<td><div class="actions"><a href="#view-user" class="act act--view" title="View" data-uid="' + u.id + '"><i class="ic i-eye"></i></a>' +
        (admin ? '<a href="#edit-user" class="act act--edit" title="Edit" data-uid="' + u.id + '"><i class="ic i-edit"></i></a>' +
          (u.id === me().id ? "" : '<a href="#delete-user" class="act act--del" title="Remove" data-uid="' + u.id + '"><i class="ic i-trash"></i></a>') : "") +
        "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="center muted" style="padding:36px 16px;white-space:normal">No users match these filters.</td></tr>';

    var from = total ? (page - 1) * PAGE + 1 : 0, to = Math.min(page * PAGE, total);
    byId("user-pager-info").innerHTML = "Showing <strong>" + from + "–" + to + "</strong> of <strong>" + total + "</strong> users";
    var nav = '<button type="button" class="pg-btn" data-page="' + (page - 1) + '"' + (page === 1 ? " disabled" : "") + ' aria-label="Previous page"><i class="ic i-chev-left"></i></button>';
    for (var p = 1; p <= pages; p++) nav += '<button type="button" class="pg-btn' + (p === page ? " is-current" : "") + '" data-page="' + p + '">' + p + "</button>";
    nav += '<button type="button" class="pg-btn" data-page="' + (page + 1) + '"' + (page === pages ? " disabled" : "") + ' aria-label="Next page"><i class="ic i-chev-right"></i></button>';
    byId("user-pager-nav").innerHTML = nav;
    stats();
  }
  function stats() {
    var all = S.users(org().id), count = function (st) { return all.filter(function (u) { return u.status === st; }).length; };
    var set = function (k, v) { $$('[data-stat="' + k + '"]').forEach(function (el) { el.textContent = v; }); };
    set("total", all.length);
    var lim = S.limit(org().id, "users");
    set("seats", lim ? "limit " + lim : "no user limit");
    set("active", count("active"));
    set("invited", count("invited"));
    set("inactive", count("inactive") + count("suspended"));
  }

  ["uf-search", "uf-role", "uf-shift", "uf-status"].forEach(function (id) {
    byId(id).addEventListener(id === "uf-search" ? "input" : "change", function () { page = 1; render(); });
  });
  byId("user-page-size").addEventListener("change", function (e) { PAGE = +e.target.value || 6; page = 1; render(); });
  byId("user-pager-nav").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]");
    if (b && !b.disabled) { page = +b.getAttribute("data-page"); render(); }
  });
  // Remember which row's action was clicked (the modal opens via the #hash)
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-uid]");
    if (a) selected = S.user(a.getAttribute("data-uid"));
  }, true);

  /* ---------- Invite ---------- */
  function resetInvite() {
    var body = $("#add-user .modal__body");
    ["iu-first", "iu-last", "iu-email", "iu-mobile"].forEach(function (id) { byId(id).value = ""; });
    byId("iu-emp").value = S.nextEmpId(org().id);
    options(byId("iu-role"), S.ROLES, "Operator");
    options(byId("iu-dept"), S.DEPARTMENTS, "Production");
    UI.formError(body, "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-invite-user]");
    if (!b) return;
    e.preventDefault();
    var body = $("#add-user .modal__body");
    var f = ["iu-first", "iu-last", "iu-email", "iu-mobile", "iu-emp"].map(byId);
    if (S.limitReached(org().id, "users")) return UI.formError(body, "Your organisation has reached its limit of " + S.limit(org().id, "users") + " users. Ask the platform admin to raise it.");
    if (!UI.validate(f)) return;
    if (S.emailTaken(org().id, f[2].value)) return UI.formError(body, "Someone in this organisation already uses that email.");
    if (S.users(org().id).some(function (u) { return u.empId.toLowerCase() === f[4].value.trim().toLowerCase(); })) return UI.formError(body, "That employee ID is already taken.");
    var u = S.createUser(org().id, {
      first: f[0].value, last: f[1].value, email: f[2].value, mobile: f[3].value.trim(), empId: f[4].value.trim().toUpperCase(),
      dept: byId("iu-dept").value, role: byId("iu-role").value, shift: byId("iu-shift").value.split(" · ")[0],
      sites: $$("[data-iu-site]:checked").map(function (c) { return c.value; }), twoFactor: byId("iu-2fa").checked,
    }, { invitedBy: me().id });
    page = 1;
    render();
    window.dispatchEvent(new Event("ed:limits"));
    showInviteLink(u);
  });
  function showInviteLink(u) {
    byId("invite-link").value = S.inviteLink(u);
    $$("[data-il-name]").forEach(function (el) { el.textContent = S.fullName(u); });
    $$("[data-il-email]").forEach(function (el) { el.textContent = u.email; });
    byId("invite-open").href = S.inviteLink(u);
    location.hash = "invite-sent";
  }

  /* ---------- View ---------- */
  function fillView(u) {
    var m = byId("view-user");
    $("[data-v=avatar]", m).className = "avatar avatar--lg " + avatarClass(u);
    $("[data-v=avatar]", m).textContent = S.initials(S.fullName(u));
    $("[data-v=name]", m).textContent = S.fullName(u);
    $("[data-v=email]", m).textContent = u.email;
    $("[data-v=badges]", m).innerHTML = roleBadge(u.role) + shiftPill(u.shift) + statusBadge(u.status);
    $("[data-v=emp]", m).textContent = u.empId;
    $("[data-v=username]", m).textContent = u.username;
    $("[data-v=mobile]", m).textContent = u.mobile || "—";
    $("[data-v=dept]", m).textContent = u.dept || "—";
    $("[data-v=created]", m).textContent = new Date(u.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    $("[data-v=last]", m).textContent = u.status === "invited" ? "Not signed in yet" : S.timeAgo(u.lastActive);
    var inv = $("[data-v=invite]", m);
    inv.hidden = u.status !== "invited";
    if (u.status === "invited") byId("view-invite-link").value = S.inviteLink(u);
    $("[data-v=edit]", m).hidden = !UI.isAdmin();
    $("[data-v=edit]", m).setAttribute("data-uid", u.id);
  }

  /* ---------- Edit ---------- */
  function fillEdit(u) {
    var m = byId("edit-user");
    $("[data-e=avatar]", m).className = "avatar avatar--lg " + avatarClass(u);
    $("[data-e=avatar]", m).textContent = S.initials(S.fullName(u));
    $("[data-e=name]", m).textContent = S.fullName(u);
    $("[data-e=sub]", m).textContent = S.fullName(u) + " · " + u.empId;
    $("[data-e=meta]", m).textContent = "Joined " + new Date(u.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
      (u.status === "invited" ? " · Invitation pending" : " · Last active " + S.timeAgo(u.lastActive).toLowerCase());
    byId("eu-first").value = u.first;
    byId("eu-last").value = u.last || "";
    byId("eu-email").value = u.email;
    byId("eu-mobile").value = u.mobile || "";
    byId("eu-emp").value = u.empId;
    options(byId("eu-dept"), S.DEPARTMENTS.indexOf(u.dept) > -1 || !u.dept ? S.DEPARTMENTS : S.DEPARTMENTS.concat(u.dept), u.dept);
    options(byId("eu-role"), S.ROLES, u.role);
    options(byId("eu-shift"), S.SHIFTS, u.shift);
    var st = byId("eu-status");
    options(st, u.status === "invited" ? ["Invited"] : ["Active", "Inactive", "Suspended"], u.status.charAt(0).toUpperCase() + u.status.slice(1));
    st.disabled = u.status === "invited" || u.id === me().id;
    byId("eu-role").disabled = u.id === me().id; // can't demote yourself
    UI.formError($(".modal__body", m), "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-save-user]");
    if (!b || !selected) return;
    var body = $("#edit-user .modal__body");
    var f = ["eu-first", "eu-last", "eu-email", "eu-mobile", "eu-emp"].map(byId);
    if (!UI.validate(f)) return e.preventDefault();
    if (S.emailTaken(org().id, f[2].value, selected.id)) { e.preventDefault(); return UI.formError(body, "Someone else in this organisation already uses that email."); }
    var patch = {
      first: f[0].value.trim(), last: f[1].value.trim(), email: f[2].value.trim(), mobile: f[3].value.trim(), empId: f[4].value.trim().toUpperCase(),
      dept: byId("eu-dept").value, role: byId("eu-role").value, shift: byId("eu-shift").value,
    };
    if (selected.status !== "invited") patch.status = byId("eu-status").value.toLowerCase();
    var admins = S.users(org().id).filter(function (u) { return u.role === "Tenant Admin" && u.status === "active"; });
    if (selected.role === "Tenant Admin" && (patch.role !== "Tenant Admin" || patch.status !== "active") && admins.length <= 1) {
      e.preventDefault();
      return UI.formError(body, "An organisation needs at least one active Tenant Admin.");
    }
    S.updateUser(selected.id, patch);
    render();
    UI.refresh();
  });

  /* ---------- Remove ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-delete-user]");
    if (!b || !selected) return;
    if (selected.id === me().id) { e.preventDefault(); location.hash = "close"; return; }
    S.deleteUser(selected.id);
    selected = null;
    render();
  });

  function onHash() {
    var h = location.hash;
    if (h === "#add-user") {
      if (!UI.isAdmin()) { location.hash = "close"; return; }
      resetInvite();
    } else if ((h === "#view-user" || h === "#edit-user" || h === "#delete-user") && !selected) {
      location.hash = "close"; // opened without picking a row (e.g. page reload)
    } else if (h === "#view-user") fillView(selected);
    else if (h === "#edit-user") {
      if (!UI.isAdmin()) { location.hash = "close"; return; }
      fillEdit(selected);
    } else if (h === "#delete-user") $$("[data-d=name]").forEach(function (el) { el.textContent = S.fullName(selected); });
  }
  window.addEventListener("hashchange", onHash);

  render();
  onHash();
})();
