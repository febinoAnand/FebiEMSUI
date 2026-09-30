/* ==========================================================================
   Energy Dashboard — Alerts page: "Alert rules" table
   Merges the per-meter rules saved from meter pages (EDStore.meterRules) with the
   page's built-in group rules, and pages / filters them in JS.
   Add rule / Edit open the rule builder (meter-alerts.js) right here, with a meter picker.
   ========================================================================== */
(function () {
  var S = window.EDStore, T = window.EDRules;
  var radio = document.querySelector('input.pg-input[name="ar-pg"]');
  if (!S || !T || !radio) return;
  var card = radio.closest(".card");
  var sess = S.session();
  if (sess.status !== "ok") return;
  var ORG = sess.tenant.id;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // Meter names from the registry (meter-data.js)
  var NAMES = {}, SUBS = {};
  (window.ED_METERS || []).forEach(function (m) {
    NAMES[m.id] = m.name; SUBS[m.id] = (m.subs || []).length;
    (m.subs || []).forEach(function (s) { NAMES[s.id] = s.name; });
  });

  // Built-in group rules already in the page → keep their markup, drop the CSS-only paging
  var groupRows = $$("tbody tr", card).map(function (tr) { return tr.outerHTML; });
  $$(".pg-input", card).forEach(function (r) { r.remove(); });
  card.classList.remove("paged");
  var table = $("table", card);
  table.classList.add("ar-table");
  $$("tbody", table).forEach(function (tb) { tb.remove(); });
  var body = document.createElement("tbody");
  table.appendChild(body);
  var pager = $(".pager", card);
  pager.innerHTML = '<div class="pager__info" id="ar-info"></div>' +
    '<div class="pager__size">Rows per page <select class="input" id="ar-size" aria-label="Rows per page"><option>4</option><option selected>8</option><option>16</option></select></div>' +
    '<div class="pager__nav" id="ar-nav"></div>';

  // Filter: all / meter rules / group rules
  var head = $(".card__head", card);
  $(".card__sub", head).textContent = "Conditions that raise alerts, and who gets notified · add rules here or from any meter's page";
  var filter = document.createElement("div");
  filter.className = "seg";
  filter.id = "ar-filter";
  head.insertBefore(filter, head.lastElementChild);

  var kind = "all", page = 1;

  function meterRow(r) {
    var sev = T.SEV[r.severity] || T.SEV.Warning, name = NAMES[r.meter] || r.meter;
    var scope = r.scope === "withSubs" ? " + " + (SUBS[r.meter] || "all") + " sub-meters" : r.scope === "subs" ? " · " + r.subs.length + " sub-meter" + (r.subs.length === 1 ? "" : "s") : " · meter only";
    return '<tr data-kind="meter"' + (r.enabled ? "" : ' class="is-muted"') + ">" +
      '<td><strong>' + esc(r.name) + '</strong><div class="small muted"><span class="mono">' + esc(r.id) + '</span> · <span class="tc-primary">Meter rule</span></div></td>' +
      '<td><span class="tag">' + esc(T.metricText(r)) + "</span></td>" +
      '<td class="mono small ar-cond">' + esc(T.condText(r)) + (r.active.mode !== "always" ? '<div class="muted" style="font-family:var(--font)">' + esc(T.activeText(r.active)) + "</div>" : "") + "</td>" +
      "<td>" + esc(name) + '<div class="small muted"><a href="meter.html?id=' + encodeURIComponent(r.meter) + '#meter-rules" class="mono row-link">' + esc(r.meter) + "</a>" + esc(scope) + "</div></td>" +
      '<td class="small">' + esc(T.channelsText(r.notify.channels)) + "</td>" +
      '<td><span class="badge badge--' + sev[0] + '">' + esc(r.severity) + "</span></td>" +
      '<td><label class="switch"><input type="checkbox" data-ar-toggle="' + esc(r.id) + '"' + (r.enabled ? " checked" : "") + ' aria-label="Enable ' + esc(r.name) + '" /></label></td>' +
      '<td><div class="actions"><a href="#meter-rule" class="act act--edit" data-rule-edit="' + esc(r.id) + '" title="Edit"><i class="ic i-edit"></i></a><button type="button" class="act act--del" data-ar-del="' + esc(r.id) + '" title="Delete"><i class="ic i-trash"></i></button></div></td></tr>';
  }

  function render() {
    // Newest meter rules first, then the group rules
    var mr = S.meterRules(ORG).slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0); }).map(meterRow);
    var rows = kind === "meter" ? mr : kind === "group" ? groupRows : mr.concat(groupRows);
    filter.innerHTML = [["all", "All", mr.length + groupRows.length], ["meter", "Meter rules", mr.length], ["group", "Group rules", groupRows.length]].map(function (f) {
      return '<button type="button" data-kind="' + f[0] + '"' + (f[0] === kind ? ' class="is-on"' : "") + ">" + f[1] + ' <small class="muted">' + f[2] + "</small></button>";
    }).join("");
    var size = +$("#ar-size", card).value, total = rows.length, pages = Math.max(1, Math.ceil(total / size));
    page = Math.min(page, pages);
    body.innerHTML = total ? rows.slice((page - 1) * size, page * size).join("")
      : '<tr><td colspan="8" class="center muted" style="padding:32px 16px;white-space:normal">No meter rules yet. Open a meter from <a href="meters.html" class="tc-primary">Energy Meters</a> and use <b>Set alert</b>.</td></tr>';
    var from = total ? (page - 1) * size + 1 : 0, to = Math.min(page * size, total);
    $("#ar-info", card).innerHTML = "Showing <strong>" + from + "–" + to + "</strong> of <strong>" + total + "</strong> rules";
    var nav = '<button type="button" class="pg-btn" data-p="' + (page - 1) + '"' + (page === 1 ? " disabled" : "") + ' aria-label="Previous page"><i class="ic i-chev-left"></i></button>';
    for (var p = 1; p <= pages; p++) nav += '<button type="button" class="pg-btn' + (p === page ? " is-current" : "") + '" data-p="' + p + '">' + p + "</button>";
    nav += '<button type="button" class="pg-btn" data-p="' + (page + 1) + '"' + (page === pages ? " disabled" : "") + ' aria-label="Next page"><i class="ic i-chev-right"></i></button>';
    $("#ar-nav", card).innerHTML = nav;
  }

  card.addEventListener("click", function (e) {
    var f = e.target.closest("#ar-filter button");
    if (f) { kind = f.getAttribute("data-kind"); page = 1; render(); return; }
    var p = e.target.closest("#ar-nav .pg-btn");
    if (p && !p.disabled) { page = +p.getAttribute("data-p"); render(); return; }
    var d = e.target.closest("[data-ar-del]");
    if (d) {
      var r = S.meterRules(ORG).filter(function (x) { return x.id === d.getAttribute("data-ar-del"); })[0];
      if (!r || !window.confirm('Delete the alert rule "' + r.name + '" on ' + (NAMES[r.meter] || r.meter) + "?")) return;
      S.deleteMeterRule(ORG, r.id);
      render();
      window.dispatchEvent(new Event("ed:limits"));
      location.hash = "deleted";
    }
  });
  card.addEventListener("change", function (e) {
    if (e.target.id === "ar-size") { page = 1; render(); return; }
    var id = e.target.getAttribute("data-ar-toggle");
    if (!id) return;
    var r = S.meterRules(ORG).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    r.enabled = e.target.checked;
    S.saveMeterRule(ORG, r);
    render();
  });
  window.addEventListener("ed:rules", render); // created / edited in the rule builder
  window.addEventListener("storage", function (e) { if (e.key === "ed-db") render(); }); // saved in another tab

  render();
})();
