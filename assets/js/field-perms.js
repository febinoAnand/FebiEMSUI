/* ==========================================================================
   Energy Dashboard — Field-level permissions (Roles & Permissions page)
   For each role and page: which fields the role can View and Edit.
   Keys match the data-field="module.field" markers on the pages, which
   workspace.js hides / makes read-only for the signed-in user's role.
   ========================================================================== */
// Field entries: [key, label, hint?, displayOnly?] — display-only values have no Edit switch
window.ED_FIELD_MODULES = [
  { key: "meters", label: "Energy Meters", desc: "Meter & sub-meter forms, meter dashboards", fields: [
    ["name", "Meter name"], ["category", "Category"], ["model", "Make & model"], ["site", "Site"], ["location", "Location / panel"],
    ["device", "Reports via device", "Which gateway the meter reports through"], ["slave", "Modbus slave ID / register offset"], ["registerMap", "Register map"],
    ["type", "Meter type (consumer / generator)"], ["ratedLoad", "Rated load"], ["ct", "CT ratio / connection"], ["costCentre", "Cost centre"], ["status", "Status"],
    ["cost", "Energy cost (₹)", "Cost figures on meter dashboards", true], ["electrical", "Electrical parameters", "Voltage, current, PF, THD on meter dashboards", true]] },
  { key: "devices", label: "Device Management", desc: "Device forms and device details", fields: [
    ["name", "Device name"], ["type", "Device type"], ["model", "Make & model"], ["serial", "Serial number"], ["site", "Site"], ["location", "Installed at"],
    ["network", "Connectivity"], ["ip", "IP address & port"], ["mac", "MAC address"], ["protocol", "Field protocol & uplink"], ["polling", "Polling interval & baud rate"], ["firmware", "Firmware"]] },
  { key: "alerts", label: "Alerts", desc: "Alert rule forms", fields: [
    ["target", "Applies to", "Which meters the rule watches"], ["ruleName", "Rule name"], ["metric", "Metric & condition"], ["threshold", "Threshold & duration"],
    ["severity", "Severity"], ["schedule", "Active during"], ["notify", "Notify channels"], ["recipients", "Recipients"]] },
  { key: "users", label: "Users", desc: "Users table, user details and user forms", fields: [
    ["name", "Name"], ["email", "Work email"], ["mobile", "Mobile"], ["empId", "Employee ID"], ["role", "Role"], ["department", "Department"], ["shift", "Shift"], ["status", "Status"]] },
  { key: "settings", label: "Settings · Organisation", desc: "Organisation profile", fields: [
    ["orgName", "Legal name"], ["slug", "Workspace URL"], ["gstin", "GSTIN"], ["industry", "Industry"], ["contact", "Contact email"], ["timezone", "Time zone"], ["address", "Registered address"]] },
];

(function () {
  var card = document.getElementById("field-perms");
  var S = window.EDStore, UI = window.EDUI;
  if (!card || !S || !UI) return;
  var MODULES = window.ED_FIELD_MODULES;
  var $ = function (sel) { return card.querySelector(sel); };
  var org = UI.session().tenant.id;
  var roleSel = $("#fp-role"), pageSel = $("#fp-page"), list = $("#fp-list");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  roleSel.innerHTML = S.ROLES.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
  pageSel.innerHTML = MODULES.map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + "</option>"; }).join("");
  roleSel.value = "Operator";

  function current() { return MODULES.filter(function (m) { return m.key === pageSel.value; })[0]; }
  function perm(p, f) { var x = p[f] || {}; var v = x.view !== false; return { view: v, edit: v && x.edit !== false }; }

  function render() {
    var role = roleSel.value, m = current(), all = S.fieldPerms(org, role), p = all[m.key] || {};
    var admin = role === "Tenant Admin", canManage = UI.isAdmin();
    var hidden = 0, readOnly = 0;
    list.innerHTML = '<div class="fp-row fp-row--head"><span>Field</span><span>View</span><span>Edit</span></div>' +
      m.fields.map(function (f) {
        var s = admin ? { view: true, edit: true } : perm(p, f[0]);
        if (!s.view) hidden++; else if (!s.edit && !f[3]) readOnly++;
        var dis = admin || !canManage ? " disabled" : "";
        return '<div class="fp-row"><span><strong>' + esc(f[1]) + "</strong>" + (f[2] ? "<small>" + esc(f[2]) + "</small>" : "") + "</span>" +
          '<label class="switch" title="View ' + esc(f[1]) + '"><input type="checkbox" data-fp="' + f[0] + '" data-kind="view"' + (s.view ? " checked" : "") + dis + " /></label>" +
          (f[3] ? '<span class="muted" title="Display only — nothing to edit">—</span></div>' :
          '<label class="switch" title="Edit ' + esc(f[1]) + '"><input type="checkbox" data-fp="' + f[0] + '" data-kind="edit"' + (s.edit ? " checked" : "") + (s.view ? "" : " disabled") + dis + " /></label></div>");
      }).join("");
    $("#fp-summary").innerHTML = admin
      ? '<span class="badge badge--violet"><i class="ic i-shield"></i> Tenant Admin always has full access</span>'
      : '<span class="badge badge--success">' + (m.fields.length - hidden - readOnly) + " editable</span>" +
        '<span class="badge badge--warn">' + readOnly + " view only</span>" +
        '<span class="badge badge--danger">' + hidden + " hidden</span>";
    card.querySelectorAll("[data-fp-bulk]").forEach(function (b) { b.disabled = admin || !canManage; });
  }

  function save(mutate) {
    var role = roleSel.value, all = S.fieldPerms(org, role), m = current();
    all[m.key] = all[m.key] || {};
    mutate(all[m.key], m);
    S.setFieldPerms(org, role, all);
    render();
    UI.applyFieldPerms();
  }

  list.addEventListener("change", function (e) {
    var i = e.target, key = i.getAttribute("data-fp");
    if (!key) return;
    save(function (p) {
      var s = perm(p, key);
      if (i.getAttribute("data-kind") === "view") { s.view = i.checked; if (!i.checked) s.edit = false; }
      else { s.edit = i.checked; if (i.checked) s.view = true; }
      p[key] = s;
    });
    var t = document.getElementById("fp-toast");
    if (t) { t.classList.remove("is-shown"); void t.offsetWidth; t.classList.add("is-shown"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("is-shown"); }, 2400); }
  });
  card.addEventListener("click", function (e) {
    var b = e.target.closest("[data-fp-bulk]");
    if (!b) return;
    var mode = b.getAttribute("data-fp-bulk");
    save(function (p, m) {
      m.fields.forEach(function (f) {
        p[f[0]] = mode === "all" ? { view: true, edit: true } : mode === "view" ? { view: true, edit: false } : { view: false, edit: false };
      });
    });
  });
  roleSel.addEventListener("change", render);
  pageSel.addEventListener("change", render);
  // Follow the permission matrix's role dropdown when it names the same role
  var mx = document.getElementById("mx-role");
  if (mx) mx.addEventListener("change", function () {
    var name = mx.options[mx.selectedIndex].text;
    if (S.ROLES.indexOf(name) > -1) { roleSel.value = name; render(); }
  });
  render();
})();
