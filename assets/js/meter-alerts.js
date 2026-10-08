/* ==========================================================================
   Energy Dashboard — alert rule builder for meters
   • meter.html?id=…  : "Alert rules" card + builder for that meter (context from meter.js)
   • alerts.html      : the same builder with a meter picker (context from meter-data.js)
   Rules are saved per tenant (EDStore.saveMeterRule) and count toward the tenant's
   "Alert rules" limit. Fires "ed:rules" on window whenever rules change.
   ========================================================================== */
(function () {
  var S = window.EDStore;
  var card = document.getElementById("meter-rules");
  var PICK = !window.ED_METER_CTX; // no single meter on this page → choose one in the dialog
  if (!S || (!PICK && !card) || (PICK && !(window.ED_METERS || []).length)) return;
  var sess = S.session();
  if (sess.status !== "ok") return;
  var ORG = sess.tenant.id, TARIFF = 8;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var known = function (a) { return a && a.length && a.every(function (x) { return x != null; }); };
  var avg = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
  var imb = function (a) { if (!known(a)) return null; var m = avg(a); return m ? (Math.max.apply(null, a) - Math.min.apply(null, a)) / m * 100 : 0; };
  var lo = function (a) { return known(a) ? Math.min.apply(null, a) : null; };
  var hi = function (a) { return known(a) ? Math.max.apply(null, a) : null; };

  // Context for a meter picked on the Alerts page: only power, load and status are known there
  function ctxFor(id) {
    var m = null, parent = null;
    window.ED_METERS.forEach(function (x) {
      if (x.id === id) m = x;
      (x.subs || []).forEach(function (sm) { if (sm.id === id) { m = sm; parent = x; } });
    });
    if (!m) return null;
    var kw = Math.abs(m.power || 0), on = kw > 0 && !/offline|maintenance/i.test(m.status || "");
    return { meter: m, parent: parent, isSub: !!parent, live: on, partial: true, rated: m.load > 0 ? kw / (m.load / 100) : null, groupRules: [],
      phase: m.phase === 1 ? 1 : 3, now: { kw: on ? kw : 0, kva: null, load: on ? m.load : 0, pf: null, v: m.phase === 1 ? [null] : [null, null, null], i: m.phase === 1 ? [null] : [null, null, null], hz: null, thdV: null, thdI: null, kwhToday: null } };
  }

  // Everything that depends on the meter; setMeter() recomputes it
  var C, meter, N, live, PARAMS, P, VARS, subs, kindName;
  function setMeter(ctx) {
    C = ctx; meter = C.meter; N = C.now; live = C.live;
    PARAMS = [
      { g: "Power", key: "kw", label: "Active power", unit: "kW", now: live ? N.kw : null, d: 1 },
      { g: "Power", key: "kva", label: "Apparent power", unit: "kVA", now: live ? N.kva : null, d: 1 },
      { g: "Power", key: "load", label: C.rated ? "Load · % of rated " + fmt(C.rated, 0) + " kW" : "Load · % of rated", short: "Load", unit: "%", now: N.load, d: 0 },
      { g: "Power quality", key: "pf", label: "Power factor", unit: "", now: N.pf, d: 2 },
      { g: "Power quality", key: "v_min", label: "Lowest phase voltage", unit: "V", now: live ? lo(N.v) : null, d: 1 },
      { g: "Power quality", key: "v_max", label: "Highest phase voltage", unit: "V", now: live ? hi(N.v) : null, d: 1 },
      { g: "Power quality", key: "v_imb", label: "Voltage imbalance", unit: "%", now: live ? imb(N.v) : null, d: 1 },
      { g: "Power quality", key: "i_max", label: "Highest phase current", unit: "A", now: live ? hi(N.i) : null, d: 1 },
      { g: "Power quality", key: "i_imb", label: "Current imbalance", unit: "%", now: live ? imb(N.i) : null, d: 1 },
      { g: "Power quality", key: "hz", label: "Frequency", unit: "Hz", now: N.hz, d: 2 },
      { g: "Power quality", key: "thd_v", label: "Voltage THD", unit: "%", now: N.thdV, d: 1 },
      { g: "Power quality", key: "thd_i", label: "Current THD", unit: "%", now: N.thdI, d: 1 },
      { g: "Energy & cost", key: "kwh", label: "Energy in the window", short: "Energy", unit: "kWh", now: N.kwhToday, nowNote: "today", d: 0 },
      { g: "Energy & cost", key: "cost", label: "Cost in the window", short: "Cost", unit: "₹", now: N.kwhToday == null ? null : N.kwhToday * TARIFF, nowNote: "today", d: 0, pre: true },
      { g: "Communication", key: "nodata", label: "Time without readings", short: "No readings", unit: "min", now: live && !C.partial ? 0 : null, d: 0, only: ["gt"] },
    ];
    var one = (C.phase || C.meter.phase) === 1;
    if (one) {
      PARAMS = PARAMS.filter(function (p) { return p.key !== "v_imb" && p.key !== "i_imb"; });
      PARAMS.forEach(function (p) { if (p.key === "v_min" || p.key === "v_max") p.label = p.key === "v_min" ? "Voltage (lowest)" : "Voltage (highest)"; if (p.key === "i_max") p.label = "Current"; });
    }
    P = {};
    PARAMS.forEach(function (p) { P[p.key] = p; });
    VARS = {
      kw: N.kw, kva: N.kva, load: N.load, pf: N.pf, v1: N.v[0], v2: N.v[1], v3: N.v[2], i1: N.i[0], i2: N.i[1], i3: N.i[2],
      v_imb: one ? undefined : imb(N.v), i_imb: one ? undefined : imb(N.i), hz: N.hz, thd_v: N.thdV, thd_i: N.thdI, kwh: N.kwhToday, cost: N.kwhToday == null ? null : N.kwhToday * TARIFF,
    };
    if (one) ["v2", "v3", "i2", "i3", "v_imb", "i_imb"].forEach(function (k) { delete VARS[k]; });
    subs = !C.isSub ? meter.subs || [] : [];
    kindName = C.isSub ? "sub-meter" : "meter";
  }
  setMeter(PICK ? ctxFor(new URLSearchParams(location.search).get("target") || "") || ctxFor(window.ED_METERS[0].id) : window.ED_METER_CTX);

  var OPS = { gt: "is above", lt: "is below", between: "is between", outside: "is outside", rise: "rises by more than", drop: "drops by more than" };
  var EVAL = { live: "Every reading (15 s)", avg15: "15-minute average", hour: "Hourly total / average", day: "Daily total / average" };
  var HOLD = [[0, "Immediately"], [1, "1 min"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"]];
  var SEV = { Critical: ["danger", "--rose"], Warning: ["warn", "--amber"], Info: ["info", "--cyan"] };
  var SHIFTS = [["A", "Shift A · 06–14"], ["B", "Shift B · 14–22"], ["C", "Shift C · 22–06"], ["G", "General · 09:30–18:30"]];
  var SLOTS = [["T1", "22–06"], ["T2", "06–10"], ["T3", "10–14"], ["T4", "14–18"], ["T5", "18–22"]];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var CHANNELS = [["app", "In-app", "i-bell"], ["email", "Email", "i-mail"], ["sms", "SMS", "i-phone"], ["whatsapp", "WhatsApp", "i-send"], ["webhook", "Webhook", "i-globe"]];
  var ROLES = [["Tenant Admin", "Tenant admins"], ["Energy Manager", "Energy managers"], ["Supervisor", "Supervisor on shift"], ["Technician", "Maintenance technicians"]];
  var FUNCS = { abs: "Math.abs", min: "Math.min", max: "Math.max" };


  /* ---------- which saved rules watch this meter ---------- */
  function applies(r) {
    if (r.meter === meter.id) return true;
    if (C.isSub && r.meter === C.parent.id) return r.scope === "withSubs" || (r.scope === "subs" && r.subs.indexOf(meter.id) > -1);
    return false;
  }
  function mine() { return S.meterRules(ORG).filter(applies); }

  /* ---------- plain-language summaries (shared with the Alerts page) ---------- */
  var T = window.EDRules;
  var condText = T.condText, activeText = T.activeText;
  function scopeText(r) {
    if (r.scope === "withSubs") return "This meter + " + subs.length + " sub-meters";
    if (r.scope === "subs") return r.subs.length + " sub-meter" + (r.subs.length === 1 ? "" : "s");
    return "This " + kindName;
  }

  /* ---------- evaluate against the latest readings ---------- */
  function rowNow(r) {
    var p = P[r.param]; if (!p || p.now == null || r.op === "rise" || r.op === "drop") return null;
    var x = p.now;
    return r.op === "gt" ? x > r.v1 : r.op === "lt" ? x < r.v1 : r.op === "between" ? x >= r.v1 && x <= r.v2 : x < r.v1 || x > r.v2;
  }
  function compile(expr) {
    var src = String(expr || "").trim();
    if (!src) return { error: "Write an expression, e.g. kw > 48 and pf < 0.9" };
    var re = /\s*(>=|<=|==|!=|>|<|\(|\)|,|\+|-|\*|\/|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)\s*/y, out = [], m, cmp = false, depth = 0;
    re.lastIndex = 0;
    while (re.lastIndex < src.length) {
      var at = re.lastIndex;
      m = re.exec(src);
      if (!m) return { error: "Can't read “" + src.slice(at, at + 12) + "”" };
      var t = m[1], low = t.toLowerCase();
      if (/^[A-Za-z_]/.test(t)) {
        if (low === "and") out.push("&&");
        else if (low === "or") out.push("||");
        else if (low === "not") out.push("!");
        else if (FUNCS[low]) out.push(FUNCS[low]);
        else if (low in VARS) out.push("V." + low);
        else return { error: "Unknown name “" + t + "”. Use the variables listed below." };
      } else {
        if (/^(>=|<=|==|!=|>|<)$/.test(t)) cmp = true;
        if (t === "(") depth++;
        if (t === ")" && --depth < 0) return { error: "A “)” has no matching “(”." };
        out.push(t);
      }
    }
    if (depth) return { error: "A “(” is not closed." };
    if (!cmp) return { error: "Add a comparison such as >, < or ==." };
    try { var fn = new Function("V", "return !!(" + out.join(" ") + ");"); fn(VARS); return { fn: fn }; }
    catch (e) { return { error: "The expression isn't complete." }; }
  }
  function nowState(r) {
    if (!live) return null;
    if (r.cond.mode === "expr") { if (C.partial) return null; var c = compile(r.cond.expr); return c.fn ? c.fn(VARS) : null; }
    var res = r.cond.rows.map(rowNow).filter(function (x) { return x !== null; });
    if (!res.length) return null;
    return r.cond.match === "any" ? res.some(Boolean) : res.every(Boolean) && res.length === r.cond.rows.length;
  }

  /* ---------- the rules card ---------- */
  function changed() { if (card) renderCard(); window.dispatchEvent(new Event("ed:rules")); window.dispatchEvent(new Event("ed:limits")); }
  function renderCard() {
    var list = mine(), group = C.groupRules;
    var items = list.map(function (r) {
      var own = r.meter === meter.id, st = r.enabled ? nowState(r) : null, sev = SEV[r.severity] || SEV.Warning;
      var controls = own ? '<label class="switch" title="' + (r.enabled ? "Active" : "Paused") + '"><input type="checkbox" data-rule-toggle="' + r.id + '"' + (r.enabled ? " checked" : "") + ' aria-label="Rule ' + esc(r.name) + ' active" /></label>' +
          '<div class="actions"><a href="#meter-rule" class="act act--edit" data-rule-edit="' + r.id + '" title="Edit"><i class="ic i-edit"></i></a><button type="button" class="act act--del" data-rule-del="' + r.id + '" title="Delete"><i class="ic i-trash"></i></button></div>'
        : '<a href="meter.html?id=' + esc(C.parent.id) + '&tab=alerts#meter-rules" class="btn btn--sm btn--ghost">Open parent</a>';
      return '<div class="mrule' + (r.enabled ? "" : " is-off") + '" style="--c:var(' + sev[1] + ')">' +
        '<span class="mrule__sev" title="' + esc(r.severity) + '"><i class="ic i-bell"></i></span>' +
        '<div class="grow"><div class="mrule__top"><strong>' + esc(r.name) + '</strong><div class="mrule__ctl">' + controls + "</div></div>" +
        '<div class="row wrap" style="gap:6px"><span class="badge badge--' + sev[0] + '">' + esc(r.severity) + "</span>" +
        (!r.enabled ? '<span class="badge"><span class="dot"></span> Paused</span>' : st === true ? '<span class="badge badge--danger"><span class="dot dot--live"></span> Triggered now</span>' : st === false ? '<span class="badge badge--success"><span class="dot"></span> Normal</span>' : "") + "</div>" +
        '<small class="mono">' + esc(condText(r)) + "</small>" +
        '<small class="muted">' + esc(own ? scopeText(r) : "From parent " + C.parent.name) + " · " + esc(activeText(r.active)) + " · " + esc(r.notify.channels.map(function (c) { return (CHANNELS.filter(function (x) { return x[0] === c; })[0] || [0, c])[1]; }).join(", ")) + "</small></div>" +
        "</div>";
    }).join("");
    card.innerHTML = '<div class="card__head"><div><h3 class="card__title"><i class="ic i-bell"></i> Alert rules (' + (list.length + group.length) + ')</h3><p class="card__sub">Rules that watch this ' + kindName + "</p></div>" +
      '<a href="#meter-rule" class="btn btn--sm btn--soft" data-rule-new data-limit="alertRules"><i class="ic i-plus"></i> New rule</a></div>' +
      '<div class="card__body">' +
      (items || '<div class="mrule-empty"><span class="icon-tile"><i class="ic i-bell"></i></span><div><strong>No rules for this ' + kindName + ' yet</strong><small class="muted">Get alerted when its power, quality or energy crosses a limit you set.</small></div></div>') +
      (group.length ? '<div class="mrule-group"><div class="row-between"><span class="eyebrow">Group rules from Alerts</span><a href="alerts.html" class="small tc-primary">Manage</a></div>' +
        group.map(function (g) {
          return '<div class="mrule mrule--ro" style="--c:var(' + (SEV[g.severity] || SEV.Warning)[1] + ')"><span class="mrule__sev"><i class="ic i-bell"></i></span><div class="grow"><strong>' + esc(g.name) + '</strong><small class="mono">' + esc(g.text) + '</small></div><span class="badge badge--' + (SEV[g.severity] || SEV.Warning)[0] + '">' + esc(g.severity) + "</span></div>";
        }).join("") + "</div>" : "") +
      "</div>";
    window.dispatchEvent(new Event("ed:limits"));
  }

  /* ---------- the builder dialog ---------- */
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function paramOptions(sel) {
    var groups = {};
    PARAMS.forEach(function (p) { (groups[p.g] = groups[p.g] || []).push(p); });
    return Object.keys(groups).map(function (g) {
      return '<optgroup label="' + g + '">' + groups[g].map(function (p) { return opt(p.key, p.label + (p.unit && !p.pre ? " (" + p.unit + ")" : p.pre ? " (₹)" : ""), sel); }).join("") + "</optgroup>";
    }).join("");
  }
  function pill(name, value, label, checked, type) {
    return '<label class="pick"><input type="' + (type || "checkbox") + '" name="' + name + '" value="' + esc(value) + '"' + (checked ? " checked" : "") + " /><span>" + label + "</span></label>";
  }
  function section(n, id, icon, title, body, open) {
    return '<details class="rb" id="rb-' + id + '"' + (open ? " open" : "") + '><summary><span class="rb__n">' + n + '</span><i class="ic ' + icon + '"></i><strong>' + title + '</strong><small class="rb__sum" data-sum="' + id + '"></small><i class="ic i-chev-down rb__chev"></i></summary><div class="rb__body">' + body + "</div></details>";
  }

  var modal = document.createElement("div");
  modal.innerHTML =
    '<div class="modal" id="meter-rule" role="dialog" aria-modal="true" aria-labelledby="mr-title"><a href="#close" class="modal__backdrop" aria-label="Close"></a>' +
    '<div class="modal__dialog modal__dialog--lg"><div class="modal__head"><span class="modal__icon modal__icon--amber"><i class="ic i-bell"></i></span>' +
    '<div><h3 id="mr-title">New alert rule</h3><p id="mr-sub"></p></div>' +
    '<a href="#close" class="modal__close" aria-label="Close"><i class="ic i-x"></i></a></div>' +
    '<div class="modal__body rb-wrap">' +
    '<div class="callout callout--danger" data-limit-full="alertRules" hidden style="margin-bottom:14px"></div>' +
    '<div class="callout callout--danger" id="mr-errors" hidden style="margin-bottom:14px"></div>' +
    section(1, "rule", "i-edit", "Rule",
      '<div class="form-grid"><div class="field full"><label for="mr-name">Rule name <span class="req">*</span></label><input id="mr-name" class="input" maxlength="80" /></div>' +
      '<div class="field full"><label>Severity</label><div class="picks" id="mr-sev">' + ["Critical", "Warning", "Info"].map(function (s) { return pill("mr-sev", s, '<span class="dot" style="--c:var(' + SEV[s][1] + ')"></span> ' + s, s === "Warning", "radio"); }).join("") + "</div></div>" +
      '<label class="switch full"><input type="checkbox" id="mr-enabled" checked /> Rule is active</label></div>', true) +
    section(2, "watch", "i-gauge", "What to watch",
      '<div class="form-grid">' + (PICK ? '<div class="field full"><label for="mr-meter">Meter <span class="req">*</span></label><select id="mr-meter" class="input">' + meterOptions() + "</select></div>" : "") +
      '<div class="field full" id="mr-scope-wrap"></div>' +
      '<div class="field full"><label for="mr-eval">Check</label><select id="mr-eval" class="input">' + Object.keys(EVAL).map(function (k) { return opt(k, EVAL[k], "live"); }).join("") + '</select><span class="hint">For energy and cost this is the window that is added up.</span></div></div>') +
    section(3, "cond", "i-sliders", "Conditions",
      '<div class="seg" role="tablist" id="mr-mode"><button type="button" class="is-on" data-mode="guided">Guided</button><button type="button" data-mode="expr">Expression</button></div>' +
      '<div id="mr-guided"><div class="row wrap" style="gap:10px;margin:14px 0 6px"><span class="small muted">Alert when</span><select id="mr-match" class="input input--sm" style="width:auto">' + opt("all", "all of these are true", "all") + opt("any", "any of these is true", "") + "</select></div>" +
      '<div id="mr-rows"></div><button type="button" class="link-add" id="mr-add-row"><i class="ic i-plus"></i> Add condition</button></div>' +
      '<div id="mr-expr" hidden><div class="field" style="margin-top:14px"><label for="mr-code">Expression</label><textarea id="mr-code" class="input mono" rows="3" spellcheck="false" placeholder="kw > 48 and (pf < 0.9 or thd_i > 8)"></textarea><span class="hint" id="mr-code-msg">Use and / or / not, brackets, + − × ÷, and abs() min() max().</span></div>' +
      '<div class="rb-vars" id="mr-vars"></div></div>' +
      '<div class="form-grid" style="margin-top:14px"><div class="field"><label for="mr-hold">For at least</label><select id="mr-hold" class="input">' + HOLD.map(function (h) { return opt(String(h[0]), h[1], "5"); }).join("") + '</select><span class="hint">Ignores short spikes.</span></div>' +
      '<div class="field"><label>With the latest readings</label><div class="rb-now" id="mr-now">—</div></div></div>', true) +
    section(4, "when", "i-clock", "When it is active",
      '<div class="seg" id="mr-when"><button type="button" class="is-on" data-when="always">Always</button><button type="button" data-when="shifts">During shifts</button><button type="button" data-when="slots">ToD slots</button><button type="button" data-when="hours">Set hours</button></div>' +
      '<div class="picks" data-when-panel="shifts" hidden style="margin-top:14px">' + SHIFTS.map(function (s) { return pill("mr-shift", s[0], s[1], s[0] === "A" || s[0] === "B"); }).join("") + "</div>" +
      '<div class="picks" data-when-panel="slots" hidden style="margin-top:14px">' + SLOTS.map(function (s) { return pill("mr-slot", s[0], "<b>" + s[0] + "</b> " + s[1], s[0] === "T2" || s[0] === "T5"); }).join("") + "</div>" +
      '<div data-when-panel="hours" hidden style="margin-top:14px"><div class="form-grid"><div class="field"><label for="mr-from">From</label><input type="time" id="mr-from" class="input" value="22:00" /></div><div class="field"><label for="mr-to">To</label><input type="time" id="mr-to" class="input" value="06:00" /></div></div>' +
      '<div class="picks" style="margin-top:12px">' + DAYS.map(function (d) { return pill("mr-day", d, d, true); }).join("") + "</div></div>") +
    section(5, "notify", "i-send", "Response",
      '<div class="form-grid"><div class="field full"><label>Send by</label><div class="picks">' + CHANNELS.map(function (c) { return pill("mr-ch", c[0], '<i class="ic ' + c[2] + '"></i> ' + c[1], c[0] === "app" || c[0] === "email"); }).join("") + "</div></div>" +
      '<div class="field full"><label>To</label><div class="picks">' + ROLES.map(function (r) { return pill("mr-role", r[0], r[1], r[0] === "Energy Manager" || r[0] === "Supervisor"); }).join("") + "</div></div>" +
      '<div class="field full"><label for="mr-user-q">Specific users</label><div class="upick" id="mr-users"><div class="upick__chips" id="mr-user-chips"></div>' +
      '<input id="mr-user-q" class="input" autocomplete="off" placeholder="Search a name, email or employee ID to add…" role="combobox" aria-expanded="false" aria-controls="mr-user-list" />' +
      '<ul class="upick__list" id="mr-user-list" role="listbox" hidden></ul></div><span class="hint">Get this alert even if their role isn\'t selected above.</span></div>' +
      '<div class="field full"><label for="mr-emails">Also email</label><input id="mr-emails" class="input" placeholder="name@company.com, another@company.com" /></div>' +
      '<div class="field"><label for="mr-repeat">While it stays true</label><select id="mr-repeat" class="input">' + opt("once", "Notify once", "once") + opt("15", "Remind every 15 min", "") + opt("60", "Remind every hour", "") + "</select></div>" +
      '<div class="field"><label for="mr-resolve">Close the alert</label><select id="mr-resolve" class="input">' + opt("auto5", "Automatically after 5 min back to normal", "auto5") + opt("auto15", "Automatically after 15 min back to normal", "") + opt("manual", "Only when someone acknowledges it", "") + "</select></div>" +
      '<div class="field full"><label for="mr-escalate">If nobody acknowledges it</label><select id="mr-escalate" class="input">' + opt("0", "Don't escalate", "0") + opt("15", "Escalate to tenant admins after 15 min", "") + opt("30", "Escalate to tenant admins after 30 min", "") + opt("60", "Escalate to tenant admins after 1 hour", "") + "</select></div></div>") +
    "</div>" +
    '<div class="modal__foot rb-foot"><p class="rb-preview" id="mr-preview"></p><a href="#close" class="btn btn--ghost">Cancel</a><button type="button" class="btn btn--primary" id="mr-save"><i class="ic i-check"></i> Create rule</button></div>' +
    "</div></div>";
  document.body.appendChild(modal.firstChild);
  var M = document.getElementById("meter-rule");

  // Meter picker (Alerts page): every meter with its sub-meters
  function meterOptions() {
    return window.ED_METERS.map(function (m) {
      return '<optgroup label="' + esc(m.name) + " · " + esc(m.id) + '">' + opt(m.id, m.name + " — meter", meter.id) +
        (m.subs || []).map(function (sm) { return opt(sm.id, "↳ " + sm.name + " · " + sm.id, meter.id); }).join("") + "</optgroup>";
    }).join("");
  }
  // Redraw the parts of the dialog that depend on the chosen meter
  function drawMeter() {
    $("#mr-sub", M).textContent = meter.name + " · " + meter.id + (C.partial ? " · live power and load only; open the meter for every reading" : "");
    $("#mr-name", M).placeholder = "e.g. " + meter.name + " overload";
    if ($("#mr-meter", M)) $("#mr-meter", M).value = meter.id;
    var scope = checked("mr-scope")[0], picked = checked("mr-subs");
    $("#mr-scope-wrap", M).innerHTML = '<label>Applies to</label><div class="picks picks--stack" id="mr-scope">' +
      pill("mr-scope", "meter", "<b>This " + kindName + "</b> · " + esc(meter.name), true, "radio") +
      (subs.length ? pill("mr-scope", "withSubs", "<b>This meter and all " + subs.length + " sub-meters</b> · each one is checked on its own", false, "radio") +
        pill("mr-scope", "subs", "<b>Only some sub-meters</b>", false, "radio") : "") + "</div>" +
      (subs.length ? '<div id="mr-subs-wrap" hidden style="margin-top:12px"><label>Sub-meters</label><div class="picks">' + subs.map(function (sm) { return pill("mr-subs", sm.id, esc(sm.name) + ' <small class="mono muted">' + esc(sm.id) + "</small>", false); }).join("") + "</div></div>" : "");
    if (scope && $('input[name="mr-scope"][value="' + scope + '"]', M)) setChecked("mr-scope", [scope]);
    setChecked("mr-subs", picked);
    $("#mr-vars", M).innerHTML = Object.keys(VARS).map(function (k) { return '<button type="button" data-var="' + k + '" title="' + (VARS[k] == null ? "No live value here" : "Now " + fmt(VARS[k], 2)) + '">' + k + "</button>"; }).join("");
  }
  function pickMeter(id) {
    var ctx = ctxFor(id);
    if (!ctx) return;
    var rows = readRows();
    setMeter(ctx); drawMeter(); setRows(rows); sync();
  }
  var editing = null; // rule id being edited, or null for a new rule

  /* specific users */
  var picked = []; // user ids
  function people() { return S.users(ORG).filter(function (u) { return u.status !== "suspended"; }); }
  function who(id) { return S.users(ORG).filter(function (u) { return u.id === id; })[0]; }
  function drawChips() {
    $("#mr-user-chips", M).innerHTML = picked.map(function (id) {
      var u = who(id); if (!u) return "";
      return '<span class="upick__chip"><span class="avatar av-' + (u.username.length % 6 + 1) + '">' + esc(S.initials(S.fullName(u))) + "</span>" + esc(S.fullName(u)) +
        ' <small class="muted">' + esc(u.role) + '</small><button type="button" data-user-del="' + esc(id) + '" aria-label="Remove ' + esc(S.fullName(u)) + '"><i class="ic i-x"></i></button></span>';
    }).join("");
  }
  function drawList() {
    var q = $("#mr-user-q", M).value.trim().toLowerCase(), list = $("#mr-user-list", M);
    var hits = people().filter(function (u) {
      return picked.indexOf(u.id) < 0 && (!q || [S.fullName(u), u.email, u.empId, u.username, u.role].join(" ").toLowerCase().indexOf(q) > -1);
    }).slice(0, 8);
    list.innerHTML = hits.length ? hits.map(function (u, i) {
      return '<li role="option" data-user-add="' + esc(u.id) + '"' + (i === 0 ? ' class="is-active"' : "") + '><span class="avatar av-' + (u.username.length % 6 + 1) + '">' + esc(S.initials(S.fullName(u))) + "</span>" +
        "<span><b>" + esc(S.fullName(u)) + "</b><small>" + esc(u.role) + " · " + esc(u.email) + (u.status === "invited" ? " · invited" : "") + "</small></span></li>";
    }).join("") : '<li class="upick__none">' + (q ? "No one matches “" + esc(q) + "”" : "Everyone is already added") + "</li>";
    list.hidden = false;
    $("#mr-user-q", M).setAttribute("aria-expanded", "true");
  }
  function closeList() { $("#mr-user-list", M).hidden = true; $("#mr-user-q", M).setAttribute("aria-expanded", "false"); }
  function addUser(id) { if (id && picked.indexOf(id) < 0) picked.push(id); $("#mr-user-q", M).value = ""; drawChips(); drawList(); sync(); }
  M.addEventListener("focusin", function (e) { if (e.target.id === "mr-user-q") drawList(); });
  M.addEventListener("input", function (e) { if (e.target.id === "mr-user-q") drawList(); });
  M.addEventListener("mousedown", function (e) {
    var li = e.target.closest("[data-user-add]");
    if (li) { e.preventDefault(); addUser(li.getAttribute("data-user-add")); }
  });
  M.addEventListener("keydown", function (e) {
    if (e.target.id !== "mr-user-q") return;
    var items = $$("#mr-user-list [data-user-add]", M), cur = items.findIndex(function (li) { return li.classList.contains("is-active"); });
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (!items.length) return;
      var n = (cur + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach(function (li, i) { li.classList.toggle("is-active", i === n); }); items[n].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") { e.preventDefault(); if (items[cur]) addUser(items[cur].getAttribute("data-user-add")); }
    else if (e.key === "Escape") { closeList(); }
    else if (e.key === "Backspace" && !e.target.value && picked.length) { picked.pop(); drawChips(); sync(); }
  });
  M.addEventListener("focusout", function (e) { if (e.target.id === "mr-user-q") setTimeout(closeList, 120); });

  /* condition rows */
  function rowHtml(r) {
    var p = P[r.param] || PARAMS[0], ops = p.only || Object.keys(OPS);
    var two = r.op === "between" || r.op === "outside", pct = r.op === "rise" || r.op === "drop";
    var unit = pct ? "%" : p.pre ? "" : p.unit;
    return '<div class="rb-row"><select class="input input--sm" data-f="param" aria-label="Parameter">' + paramOptions(p.key) + "</select>" +
      '<select class="input input--sm" data-f="op" aria-label="Comparison">' + ops.map(function (o) { return opt(o, OPS[o], r.op); }).join("") + "</select>" +
      '<div class="rb-val"><span class="input-affix">' + (p.pre && !pct ? "₹" : "") + '</span><input class="input input--sm mono" data-f="v1" inputmode="decimal" value="' + esc(r.v1 == null ? "" : r.v1) + '" aria-label="Value" placeholder="' + (p.now != null ? fmt(p.now, p.d) : "0") + '" /><span class="input-affix">' + esc(unit) + "</span></div>" +
      '<div class="rb-val"' + (two ? "" : " hidden") + '><span class="small muted">and</span><input class="input input--sm mono" data-f="v2" inputmode="decimal" value="' + esc(r.v2 == null ? "" : r.v2) + '" aria-label="Second value" /><span class="input-affix">' + esc(unit) + "</span></div>" +
      '<button type="button" class="act act--del" data-row-del title="Remove condition"><i class="ic i-x"></i></button>' +
      '<small class="rb-row__now">' + (pct ? "Compared with the previous window" : p.now != null ? "Now " + (p.pre ? "₹" : "") + fmt(p.now, p.d) + (p.pre ? "" : " " + p.unit) + (p.nowNote ? " " + p.nowNote : "") : live ? "" : "No live reading") + "</small></div>";
  }
  function readRows() {
    return $$(".rb-row", M).map(function (el) {
      var num = function (f) { var v = $('[data-f="' + f + '"]', el).value.trim().replace(/,/g, ""); return v === "" ? null : Number(v); };
      return { param: $('[data-f="param"]', el).value, op: $('[data-f="op"]', el).value, v1: num("v1"), v2: num("v2") };
    });
  }
  function setRows(rows) { $("#mr-rows", M).innerHTML = rows.map(rowHtml).join(""); }

  function checked(name) { return $$('input[name="' + name + '"]:checked', M).map(function (i) { return i.value; }); }
  function setChecked(name, values) { $$('input[name="' + name + '"]', M).forEach(function (i) { i.checked = values.indexOf(i.value) > -1; }); }
  function segValue(id, attr) { return $("#" + id + " .is-on", M).getAttribute(attr); }
  function setSeg(id, attr, v) { $$("#" + id + " button", M).forEach(function (b) { b.classList.toggle("is-on", b.getAttribute(attr) === v); }); }

  function readForm() {
    var mode = segValue("mr-mode", "data-mode"), when = segValue("mr-when", "data-when");
    return {
      id: editing || undefined, meter: meter.id, name: $("#mr-name", M).value.trim(), severity: checked("mr-sev")[0] || "Warning",
      enabled: $("#mr-enabled", M).checked, scope: checked("mr-scope")[0] || "meter", subs: checked("mr-subs"), evaluate: $("#mr-eval", M).value,
      cond: { mode: mode, match: $("#mr-match", M).value, rows: readRows(), expr: $("#mr-code", M).value.trim(), hold: Number($("#mr-hold", M).value) },
      active: { mode: when, shifts: checked("mr-shift"), slots: checked("mr-slot"), from: $("#mr-from", M).value, to: $("#mr-to", M).value, days: checked("mr-day") },
      notify: { channels: checked("mr-ch"), roles: checked("mr-role"), users: picked.slice(), emails: $("#mr-emails", M).value.split(/[,;\s]+/).filter(Boolean),
        repeat: $("#mr-repeat", M).value, resolve: $("#mr-resolve", M).value, escalate: Number($("#mr-escalate", M).value) },
    };
  }
  function fillForm(r) {
    editing = r ? r.id : null;
    M.dataset.ready = "1";
    if (PICK && r && r.meter !== meter.id && ctxFor(r.meter)) setMeter(ctxFor(r.meter));
    drawMeter();
    r = r || {
      name: "", severity: "Warning", enabled: true, scope: "meter", subs: [], evaluate: "live",
      cond: { mode: "guided", match: "all", rows: [{ param: "kw", op: "gt", v1: null }], expr: "", hold: 5 },
      active: { mode: "always", shifts: ["A", "B"], slots: ["T2", "T5"], from: "22:00", to: "06:00", days: DAYS.slice() },
      notify: { channels: ["app", "email"], roles: ["Energy Manager", "Supervisor"], emails: [], repeat: "once", resolve: "auto5", escalate: 0 },
    };
    $("#mr-title", M).textContent = editing ? "Edit alert rule" : "New alert rule";
    $("#mr-save", M).innerHTML = '<i class="ic i-check"></i> ' + (editing ? "Save rule" : "Create rule");
    var save = $("#mr-save", M);
    if (editing) { save.removeAttribute("data-limit"); save.classList.remove("is-disabled"); save.removeAttribute("aria-disabled"); save.removeAttribute("title"); $('[data-limit-full]', M).hidden = true; }
    else save.setAttribute("data-limit", "alertRules");
    $("#mr-name", M).value = r.name;
    setChecked("mr-sev", [r.severity]);
    $("#mr-enabled", M).checked = r.enabled;
    setChecked("mr-scope", [r.scope]);
    setChecked("mr-subs", r.subs || []);
    $("#mr-eval", M).value = r.evaluate;
    setSeg("mr-mode", "data-mode", r.cond.mode);
    $("#mr-match", M).value = r.cond.match;
    setRows(r.cond.rows.length ? r.cond.rows : [{ param: "kw", op: "gt", v1: null }]);
    $("#mr-code", M).value = r.cond.expr || "";
    $("#mr-hold", M).value = String(r.cond.hold);
    setSeg("mr-when", "data-when", r.active.mode);
    setChecked("mr-shift", r.active.shifts); setChecked("mr-slot", r.active.slots); setChecked("mr-day", r.active.days);
    $("#mr-from", M).value = r.active.from; $("#mr-to", M).value = r.active.to;
    setChecked("mr-ch", r.notify.channels); setChecked("mr-role", r.notify.roles);
    $("#mr-emails", M).value = (r.notify.emails || []).join(", ");
    picked = (r.notify.users || []).filter(function (id) { return who(id); }); drawChips(); $("#mr-user-q", M).value = ""; closeList();
    $("#mr-repeat", M).value = r.notify.repeat; $("#mr-resolve", M).value = r.notify.resolve; $("#mr-escalate", M).value = String(r.notify.escalate);
    $("#mr-errors", M).hidden = true;
    $$("details.rb", M).forEach(function (d, i) { d.open = i < 3 || !!editing; });
    sync();
    window.dispatchEvent(new Event("ed:limits"));
    if (!editing) $("[data-limit-full]", M).hidden = !S.limitReached(ORG, "alertRules");
  }

  function condProblems(r) {
    var e = [];
    if (r.cond.mode === "expr") { var c = compile(r.cond.expr); if (c.error) e.push("Expression: " + c.error); }
    else {
      if (!r.cond.rows.length) e.push("Add at least one condition.");
      r.cond.rows.forEach(function (row, i) {
        var n = r.cond.rows.length > 1 ? "Condition " + (i + 1) + ": " : "Condition: ";
        if (row.v1 == null || isNaN(row.v1)) e.push(n + "enter a value.");
        else if ((row.op === "between" || row.op === "outside") && (row.v2 == null || isNaN(row.v2) || row.v2 <= row.v1)) e.push(n + "the second value must be larger than the first.");
        else if ((row.op === "rise" || row.op === "drop") && row.v1 <= 0) e.push(n + "the change must be more than 0%.");
      });
    }
    return e;
  }
  function problems(r) {
    var e = [];
    if (!r.name) e.push("Give the rule a name.");
    if (r.scope === "subs" && !r.subs.length) e.push("Pick at least one sub-meter.");
    e = e.concat(condProblems(r));
    if (r.active.mode === "shifts" && !r.active.shifts.length) e.push("Pick at least one shift.");
    if (r.active.mode === "slots" && !r.active.slots.length) e.push("Pick at least one ToD slot.");
    if (r.active.mode === "hours" && (!r.active.from || !r.active.to || r.active.from === r.active.to)) e.push("Set different start and end times.");
    if (r.active.mode === "hours" && !r.active.days.length) e.push("Pick at least one day.");
    if (!r.notify.channels.length) e.push("Choose how to send the alert.");
    if (!r.notify.roles.length && !r.notify.users.length && !r.notify.emails.length) e.push("Choose who gets the alert: a role, specific users or an email address.");
    var bad = r.notify.emails.filter(function (m) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); });
    if (bad.length) e.push("Check these email addresses: " + bad.join(", "));
    return e;
  }

  // Keep panels, section summaries, the "now" check and the preview in step with the form
  function sync() {
    var r = readForm();
    var sw = $("#mr-subs-wrap", M); if (sw) sw.hidden = r.scope !== "subs";
    $("#mr-guided", M).hidden = r.cond.mode !== "guided";
    $("#mr-expr", M).hidden = r.cond.mode !== "expr";
    $$("[data-when-panel]", M).forEach(function (p) { p.hidden = p.getAttribute("data-when-panel") !== r.active.mode; });
    if (r.cond.mode === "expr") {
      var c = compile(r.cond.expr), msg = $("#mr-code-msg", M);
      msg.textContent = r.cond.expr ? (c.error || "Looks good.") : "Use and / or / not, brackets, + − × ÷, and abs() min() max().";
      msg.className = "hint" + (r.cond.expr ? (c.error ? " tc-rose" : " tc-green") : "");
    }
    var ok = condProblems(r).length === 0;
    var st = ok ? nowState(r) : null;
    $("#mr-now", M).innerHTML = !live ? '<span class="muted">No live reading from this ' + kindName + "</span>"
      : !ok ? '<span class="muted">Finish the conditions to check</span>'
      : st === null ? '<span class="muted">' + (C.partial ? "Open the meter's page to check every reading" : "Can’t tell yet, needs history") + "</span>"
      : st ? '<span class="badge badge--danger"><span class="dot dot--live"></span> Would trigger now</span>' : '<span class="badge badge--success"><span class="dot"></span> Normal right now</span>';
    var sum = function (k, t) { var el = $('[data-sum="' + k + '"]', M); if (el) el.textContent = t; };
    sum("rule", (r.name || "Untitled") + " · " + r.severity + (r.enabled ? "" : " · paused"));
    sum("watch", scopeText(r) + " · " + EVAL[r.evaluate]);
    sum("cond", ok ? condText(r) : "Incomplete");
    sum("when", activeText(r.active));
    sum("notify", r.notify.channels.length + " channel" + (r.notify.channels.length === 1 ? "" : "s") + " · " + (r.notify.roles.length + r.notify.users.length + r.notify.emails.length) + " recipient group" + (r.notify.roles.length + r.notify.emails.length === 1 ? "" : "s"));
    $("#mr-preview", M).innerHTML = ok ? "<b>" + esc(r.severity) + "</b> alert when " + esc(condText(r)) + (r.active.mode !== "always" ? " · " + esc(activeText(r.active)) : "") : "";
  }

  /* ---------- events ---------- */
  M.addEventListener("input", sync);
  M.addEventListener("change", function (e) {
    if (e.target.id === "mr-meter") { pickMeter(e.target.value); return; }
    var row = e.target.closest(".rb-row");
    if (row && (e.target.getAttribute("data-f") === "param" || e.target.getAttribute("data-f") === "op")) {
      var rows = readRows(), i = $$(".rb-row", M).indexOf(row), p = P[rows[i].param];
      if (p.only && p.only.indexOf(rows[i].op) < 0) rows[i].op = p.only[0];
      if (e.target.getAttribute("data-f") === "param") { rows[i].v1 = null; rows[i].v2 = null; }
      setRows(rows);
    }
    sync();
  });
  M.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !M.contains(b)) return;
    if (b.hasAttribute("data-user-del")) { picked = picked.filter(function (id) { return id !== b.getAttribute("data-user-del"); }); drawChips(); sync(); return; }
    if (b.hasAttribute("data-mode")) { setSeg("mr-mode", "data-mode", b.getAttribute("data-mode")); if (b.getAttribute("data-mode") === "expr" && !$("#mr-code", M).value) $("#mr-code", M).value = toExpr(readRows(), $("#mr-match", M).value); sync(); }
    else if (b.hasAttribute("data-when")) { setSeg("mr-when", "data-when", b.getAttribute("data-when")); sync(); }
    else if (b.id === "mr-add-row") { var rows = readRows(); rows.push({ param: rows.length ? "pf" : "kw", op: rows.length ? "lt" : "gt", v1: null }); setRows(rows); sync(); }
    else if (b.hasAttribute("data-row-del")) { var all = readRows(), idx = $$(".rb-row", M).indexOf(b.closest(".rb-row")); all.splice(idx, 1); setRows(all); sync(); }
    else if (b.hasAttribute("data-var")) {
      var ta = $("#mr-code", M), s = ta.selectionStart || ta.value.length, v = b.getAttribute("data-var");
      var pad = s && !/\s|\($/.test(ta.value.charAt(s - 1)) ? " " : "";
      ta.value = ta.value.slice(0, s) + pad + v + " " + ta.value.slice(ta.selectionEnd || s);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + pad.length + v.length + 1; sync();
    } else if (b.id === "mr-save") save();
  });
  // Guided rows → a starting expression when switching modes
  function toExpr(rows, match) {
    var VAR = { kw: "kw", kva: "kva", load: "load", pf: "pf", v_min: "min(v1, v2, v3)", v_max: "max(v1, v2, v3)", v_imb: "v_imb", i_max: "max(i1, i2, i3)", i_imb: "i_imb", hz: "hz", thd_v: "thd_v", thd_i: "thd_i", kwh: "kwh", cost: "cost" };
    return rows.filter(function (r) { return r.v1 != null && VAR[r.param] && ["gt", "lt", "between", "outside"].indexOf(r.op) > -1; }).map(function (r) {
      var x = VAR[r.param];
      return r.op === "gt" ? x + " > " + r.v1 : r.op === "lt" ? x + " < " + r.v1 : r.op === "between" ? "(" + x + " >= " + r.v1 + " and " + x + " <= " + r.v2 + ")" : "(" + x + " < " + r.v1 + " or " + x + " > " + r.v2 + ")";
    }).join(match === "any" ? " or " : " and ");
  }

  function save() {
    var r = readForm(), errs = problems(r), box = $("#mr-errors", M);
    if (errs.length) {
      box.innerHTML = '<i class="ic i-alert"></i><span><b>Check the rule:</b> ' + errs.map(esc).join(" ") + "</span>";
      box.hidden = false; box.scrollIntoView({ block: "nearest" });
      return;
    }
    if (r.cond.mode === "expr") r.cond.rows = []; else r.cond.expr = "";
    if (r.scope !== "subs") r.subs = [];
    var res = S.saveMeterRule(ORG, r);
    if (res.error === "limit") { window.dispatchEvent(new Event("ed:limits")); $("[data-limit-full]", M).hidden = false; $("[data-limit-full]", M).scrollIntoView({ block: "nearest" }); return; }
    changed();
    location.hash = editing ? "saved" : "created";
    editing = null;
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-rule-new], [data-rule-edit], [data-rule-del]");
    if (!t || t.classList.contains("is-disabled")) return;
    if (t.hasAttribute("data-rule-new")) {
      var start = t.getAttribute("data-rule-meter");
      if (PICK && start && ctxFor(start)) setMeter(ctxFor(start));
      fillForm(null);
    }
    else if (t.hasAttribute("data-rule-edit")) fillForm(S.meterRules(ORG).filter(function (r) { return r.id === t.getAttribute("data-rule-edit"); })[0] || null);
    else {
      var r = S.meterRules(ORG).filter(function (x) { return x.id === t.getAttribute("data-rule-del"); })[0];
      if (!r || !window.confirm('Delete the alert rule "' + r.name + '"?')) return;
      S.deleteMeterRule(ORG, r.id);
      changed();
      location.hash = "deleted";
    }
  }, true);
  if (card) card.addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-rule-toggle");
    if (!id) return;
    var r = S.meterRules(ORG).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    r.enabled = e.target.checked;
    S.saveMeterRule(ORG, r);
    changed();
  });
  // The form is prepared by New / Edit clicks; opened any other way (link, back button) → start a new rule
  function onHash() { if (location.hash !== "#meter-rule") M.dataset.ready = ""; else if (!M.dataset.ready) fillForm(null); }
  window.addEventListener("hashchange", onHash);

  if (card) renderCard();
  // …?rule=AR-…#meter-rule opens that rule for editing
  var linked = new URLSearchParams(location.search).get("rule");
  linked = linked && S.meterRules(ORG).filter(function (r) { return r.id === linked && (PICK || r.meter === meter.id); })[0];
  fillForm(linked || null);
  if (location.hash !== "#meter-rule") M.dataset.ready = "";
})();
