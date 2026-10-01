/* ==========================================================================
   Energy Dashboard — Shifts page: midnight crossover
   A shift whose end time is earlier than its start (e.g. 22:00 → 06:00) runs
   past midnight and ends the next day. The Create / Edit shift forms show
   this live (24-hour bar, "+1 day", correct duration, net hours after the
   break) and ask which day such a shift is counted on for attendance and
   energy. The shift table marks overnight shifts "+1" with an Overnight tag.
   ========================================================================== */
(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function mins(t) { var p = String(t || "").split(":"); return p.length === 2 ? +p[0] * 60 + +p[1] : NaN; }
  function dur(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + " h" : "") + (h && r ? " " : "") + (r ? r + " min" : "") || "0 min"; }
  // Length of a shift in minutes; end ≤ start means it ends the next day
  function length(start, end) { var s = mins(start), e = mins(end); return isNaN(s) || isNaN(e) || s === e ? NaN : (e - s + 1440) % 1440; }
  function overnight(start, end) { return mins(end) < mins(start); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function dayList(on) {
    var idx = []; on.forEach(function (o, i) { if (o) idx.push(i); });
    if (!idx.length) return "—";
    if (idx.length === 7) return "every day";
    var run = idx.every(function (d, i) { return !i || d === idx[i - 1] + 1; });
    return run && idx.length > 2 ? DAYS[idx[0]] + "–" + DAYS[idx[idx.length - 1]] : idx.map(function (i) { return DAYS[i]; }).join(", ");
  }
  var XTAG = '<span class="tag tag--night"><i class="ic i-moon"></i> Midnight crossover</span>';

  /* ---------- Shifts page: mark crossover shifts and list them on their own ---------- */
  // Any shift whose end time is earlier than its start runs into the next day — it is
  // classified as a midnight-crossover shift automatically, from its times alone.
  var xShifts = [];
  if (document.getElementById("add-shift")) {
    $$("table td.mono.nowrap").forEach(function (td) {
      var m = td.textContent.match(/^(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)$/);
      if (!m || !overnight(m[1], m[2])) return;
      var row = td.closest("tr");
      td.innerHTML = m[1] + " – " + m[2] + '<sup class="plus1" title="Ends the next day">+1</sup><div>' + XTAG + "</div>";
      xShifts.push({
        row: row, name: ($(".cell-user strong", row) || {}).textContent, code: ($(".cell-user small", row) || {}).textContent,
        icon: $(".cell-user .shift-pill", row) ? $(".cell-user .shift-pill", row).outerHTML : "", start: m[1], end: m[2],
        days: $$(".day-dots span", row).map(function (d) { return d.classList.contains("on"); }),
        boss: (row.cells[4] || {}).textContent, staff: (row.cells[5] || {}).textContent, status: row.cells[6] ? row.cells[6].innerHTML : "",
      });
    });
    var tableCard = $("table td.mono.nowrap") && $("table td.mono.nowrap").closest("section");
    if (tableCard) {
      var rows = xShifts.map(function (x) {
        var before = 1440 - mins(x.start), after = mins(x.end);
        var ends = x.days.slice(6).concat(x.days.slice(0, 6)); // each start day ends on the following day
        return '<tr><td><div class="cell-user">' + x.icon.replace('style="', 'style="flex:none;') + "<div><strong>" + esc(x.name) + '</strong><small class="mono">' + esc(x.code) + "</small></div></div></td>" +
          '<td class="mono nowrap">' + x.start + " → " + x.end + '<sup class="plus1">+1</sup><div class="small muted" style="font-family:var(--font)">' + dur(before + after) + "</div></td>" +
          '<td class="num nowrap" style="font-family:var(--font)">' + dur(before) + '<div class="small muted">on the start day</div></td>' +
          '<td class="num nowrap" style="font-family:var(--font)">' + dur(after) + '<div class="small muted">on the next day</div></td>' +
          "<td>" + dayList(x.days) + ' <span class="muted">→ ends</span> ' + dayList(ends) + "</td>" +
          '<td>The start day<div class="small muted">e.g. ' + DAYS[x.days.indexOf(true) < 0 ? 0 : x.days.indexOf(true)] + " " + x.start + " → " + DAYS[(x.days.indexOf(true) + 1) % 7] + " " + x.end + " counts as " + DAYS[x.days.indexOf(true) < 0 ? 0 : x.days.indexOf(true)] + "</div></td>" +
          "<td>" + esc(x.boss) + '</td><td class="num">' + esc(x.staff) + "</td></tr>";
      }).join("");
      tableCard.insertAdjacentHTML("afterend",
        '<section class="card" id="midnight-crossover"><div class="card__head"><div><h3 class="card__title"><i class="ic i-moon"></i> Midnight crossover shifts</h3>' +
        "<p class=\"card__sub\">Shifts that start on one day and end on the next · picked up automatically whenever a shift's end time is earlier than its start</p></div>" +
        '<span class="badge badge--violet">' + xShifts.length + " shift" + (xShifts.length === 1 ? "" : "s") + "</span></div>" +
        (xShifts.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Shift</th><th>Runs</th><th class="num">Before midnight</th><th class="num">After midnight</th><th>Start days → end days</th><th>Counted on</th><th>Supervisor</th><th class="num">Staff</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
          '<div class="card__foot small muted"><i class="ic i-alert"></i> These shifts span two dates. Attendance and the shift instance are counted on the day the shift starts; its energy is split between the two days by the hours on each side of midnight (see Shift instances).</div>'
          : '<div class="card__body small muted">No shift crosses midnight. A shift with an end time earlier than its start (e.g. 22:00 → 06:00) will appear here.</div>') +
        "</section>");
    }
  }

  /* ---------- Shift instances page: tag crossover runs and split them across the two days ---------- */
  var instHead = $$("table thead th").filter(function (th) { return /Planned \/ actual/.test(th.textContent); })[0];
  if (instHead) {
    $$("tbody tr", instHead.closest("table")).forEach(function (tr) {
      if (!$(".plus1", tr)) return;
      var first = tr.cells[0];
      if (first && !$(".tag--night", first)) first.insertAdjacentHTML("beforeend", "<div>" + XTAG + "</div>");
    });
    // This week's night runs of Shift C (22:00 → 06:00): [instance, start date, actual start, actual end, staff present, rostered, kWh, status]
    var RUNS = [
      ["SI-0921-C", "2026-09-21", "22:02", "06:00", 8, 8, 236, "Completed"],
      ["SI-0922-C", "2026-09-22", "21:58", "06:03", 8, 8, 229, "Completed"],
      ["SI-0923-C", "2026-09-23", "22:00", "06:02", 7, 8, 244, "Completed"],
      ["SI-0924-C", "2026-09-24", null, null, 0, 8, 0, "Missed"],
      ["SI-0925-C", "2026-09-25", "22:05", "06:01", 7, 8, 241, "Completed"],
    ];
    var fmtDay = function (d) { return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); };
    var tot = [0, 0];
    var body = RUNS.map(function (r) {
      var d0 = new Date(r[1] + "T00:00:00"), d1 = new Date(d0.getTime() + 864e5);
      var s = r[2] || "22:00", e = r[3] || "06:00";
      var before = 1440 - mins(s), after = mins(e), all = before + after;
      var k0 = r[6] ? Math.round(r[6] * before / all) : 0, k1 = r[6] - k0;
      tot[0] += k0; tot[1] += k1;
      var st = r[7] === "Missed" ? '<span class="badge badge--danger"><span class="dot"></span> Missed</span>' : '<span class="badge badge--primary"><span class="dot"></span> Completed</span>';
      return '<tr><td class="nowrap"><strong class="mono">' + r[0] + '</strong><div class="small muted">counted on ' + fmtDay(d0) + "</div></td>" +
        '<td class="nowrap">' + fmtDay(d0) + '<div class="mono small">' + (r[2] || "—") + "</div></td>" +
        '<td class="nowrap">' + fmtDay(d1) + '<sup class="plus1">+1</sup><div class="mono small">' + (r[3] || "—") + "</div></td>" +
        '<td class="num nowrap">' + (r[2] ? dur(before) + " / " + dur(after) : "—") + "</td>" +
        '<td class="num mono">' + (r[6] ? k0 : "—") + "</td>" +
        '<td class="num mono">' + (r[6] ? k1 : "—") + "</td>" +
        '<td class="num mono"><strong>' + (r[6] || "—") + "</strong></td>" +
        '<td class="num mono">' + r[4] + " / " + r[5] + "</td><td>" + st + "</td></tr>";
    }).join("");
    instHead.closest("section").insertAdjacentHTML("afterend",
      '<section class="card" id="midnight-crossover"><div class="card__head"><div><h3 class="card__title"><i class="ic i-moon"></i> Midnight crossover runs</h3>' +
      '<p class="card__sub">Week 39 · Shift C · Night (22:00 → 06:00) starts on one date and ends on the next, so its hours and energy are split between both days</p></div>' + XTAG + "</div>" +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Instance</th><th>Starts</th><th>Ends</th><th class="num">Hours day 1 / day 2</th><th class="num">kWh on start day</th><th class="num">kWh on next day</th><th class="num">Total kWh</th><th class="num">Staff</th><th>Status</th></tr></thead><tbody>' + body + "</tbody></table></div>" +
      '<div class="card__foot row wrap small" style="gap:18px"><span><b class="mono">' + (tot[0] + tot[1]) + ' kWh</b> across ' + RUNS.filter(function (r) { return r[6]; }).length + " nights</span>" +
      '<span class="muted">' + tot[0] + " kWh before midnight · " + tot[1] + " kWh after midnight</span>" +
      '<span class="muted">Each run is counted on the day it starts (attendance and the instance); energy is split by the hours on each side of midnight.</span></div></section>');
  }

  /* ---------- the forms ---------- */
  ["add-shift", "edit-shift"].forEach(function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    var times = $$('input[type="time"]', modal), start = times[0], end = times[1];
    var brk = $$("select", modal).filter(function (s) { return /min|None/.test(s.textContent) && /30 min/.test(s.textContent); })[0];
    if (!start || !end) return;
    start.setAttribute("aria-label", "Start time"); end.setAttribute("aria-label", "End time");
    var panel = document.createElement("div");
    panel.className = "field full shift-span";
    panel.innerHTML =
      '<div class="shift-span__bar" aria-hidden="true"><span class="shift-span__mid" title="Midnight"></span></div>' +
      '<div class="shift-span__scale" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>' +
      '<p class="shift-span__text" aria-live="polite"></p>' +
      '<div class="shift-span__night" hidden><label class="small" for="' + id + '-counts">An overnight shift counts on</label>' +
      '<select id="' + id + '-counts" class="input"><option value="start">The day it starts (Mon 22:00 → Tue 06:00 counts as Monday)</option><option value="end">The day it ends (Mon 22:00 → Tue 06:00 counts as Tuesday)</option></select>' +
      '<span class="hint">Used for attendance, shift instances and shift-wise energy reports.</span></div>';
    end.closest(".field").insertAdjacentElement("afterend", panel);
    var bar = $(".shift-span__bar", panel), text = $(".shift-span__text", panel), night = $(".shift-span__night", panel);

    function update() {
      var len = length(start.value, end.value);
      $$(".shift-span__seg", bar).forEach(function (s) { s.remove(); });
      panel.classList.toggle("is-bad", isNaN(len));
      if (isNaN(len)) {
        text.innerHTML = '<span class="tc-rose"><i class="ic i-alert"></i> ' + (start.value && start.value === end.value ? "Start and end can't be the same time." : "Enter a start and end time.") + "</span>";
        night.hidden = true;
        return false;
      }
      var s = mins(start.value), e = mins(end.value), over = overnight(start.value, end.value);
      // one segment, or two when it wraps past midnight
      (over ? [[s, 1440], [0, e]] : [[s, e]]).forEach(function (seg) {
        if (seg[1] <= seg[0]) return;
        var el = document.createElement("span");
        el.className = "shift-span__seg";
        el.style.left = seg[0] / 14.4 + "%"; el.style.width = (seg[1] - seg[0]) / 14.4 + "%";
        bar.appendChild(el);
      });
      var b = brk ? (parseInt(brk.value, 10) || 0) : 0;
      text.innerHTML = (over
        ? '<span class="tag tag--night"><i class="ic i-moon"></i> Crosses midnight</span> ' + start.value + " today → " + end.value + ' <b>next day</b><sup class="plus1">+1</sup>'
        : start.value + " → " + end.value + " (same day)") +
        " · " + dur(len) + (b ? " · " + dur(Math.max(0, len - b)) + " after a " + b + " min break" : "") +
        (len > 12 * 60 ? ' · <span class="tc-amber">longer than 12 hours</span>' : "");
      night.hidden = !over;
      return true;
    }
    [start, end].concat(brk ? [brk] : []).forEach(function (el) { el.addEventListener("input", update); el.addEventListener("change", update); });
    // Don't create / save a shift whose times don't make sense
    var save = $(".modal__foot .btn--primary", modal);
    if (save) save.addEventListener("click", function (e) { if (!update()) { e.preventDefault(); e.stopImmediatePropagation(); start.focus(); } }, true);
    modal._fill = function (row) {
      var name = $(".cell-user strong", row), code = $(".cell-user small", row), timing = (row.cells[1] || {}).textContent || "";
      var m = timing.match(/(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)/), br = ((row.cells[2] || {}).textContent || "").match(/break (\d+) min/);
      var inputs = $$("input:not([type])", modal).concat($$('input[type="text"]', modal));
      if (name && inputs[0]) inputs[0].value = name.textContent.trim();
      if (code && inputs[1] && /mono/.test(inputs[1].className)) inputs[1].value = code.textContent.trim();
      if (m) { start.value = m[1]; end.value = m[2]; }
      if (brk && br) $$("option", brk).forEach(function (o) { if (parseInt(o.textContent, 10) === +br[1]) brk.value = o.value || o.textContent; });
      // supervisor and working days from the row
      var boss = ((row.cells[4] || {}).textContent || "").trim();
      var sup = $$("select", modal).filter(function (sel) { return /Meera Iyer/.test(sel.textContent); })[0];
      if (sup && boss) {
        if (!$$("option", sup).some(function (o) { return o.textContent.trim() === boss; })) sup.insertAdjacentHTML("beforeend", "<option>" + boss.replace(/[<&>]/g, "") + "</option>");
        sup.value = boss;
      }
      var on = $$(".day-dots span", row).map(function (d) { return d.classList.contains("on"); });
      var days = $$(".check input[type=checkbox]", modal).filter(function (c) { return /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(c.parentNode.textContent.trim()); });
      if (on.length === 7 && days.length === 7) days.forEach(function (c, i) { c.checked = on[i]; });
      var sub = $(".modal__head p", modal); if (sub && name) sub.textContent = name.textContent.trim();
      update();
    };
    update();
  });

  // Edit opens the form filled in with the shift that was clicked
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#edit-shift"]');
    var modal = document.getElementById("edit-shift");
    if (a && modal && modal._fill) modal._fill(a.closest("tr"));
  });
})();
