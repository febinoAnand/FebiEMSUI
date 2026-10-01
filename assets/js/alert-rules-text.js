/* ==========================================================================
   Energy Dashboard — plain-language text for saved meter alert rules.
   Shared by the meter page (meter-alerts.js) and the Alerts page (alerts-rules.js)
   so a rule reads the same everywhere. Exposes window.EDRules.
   ========================================================================== */
(function () {
  // What a condition row can watch (labels, units, decimals). "pre" = unit goes before the value (₹)
  var PARAMS = {
    kw: { label: "Active power", unit: "kW", d: 1 },
    kva: { label: "Apparent power", unit: "kVA", d: 1 },
    load: { label: "Load", unit: "%", d: 0 },
    pf: { label: "Power factor", unit: "", d: 2 },
    v_min: { label: "Lowest phase voltage", unit: "V", d: 1 },
    v_max: { label: "Highest phase voltage", unit: "V", d: 1 },
    v_imb: { label: "Voltage imbalance", unit: "%", d: 1 },
    i_max: { label: "Highest phase current", unit: "A", d: 1 },
    i_imb: { label: "Current imbalance", unit: "%", d: 1 },
    hz: { label: "Frequency", unit: "Hz", d: 2 },
    thd_v: { label: "Voltage THD", unit: "%", d: 1 },
    thd_i: { label: "Current THD", unit: "%", d: 1 },
    kwh: { label: "Energy", unit: "kWh", d: 0 },
    cost: { label: "Cost", unit: "₹", d: 0, pre: true },
    nodata: { label: "No readings", unit: "min", d: 0 },
  };
  var OPS = { gt: "is above", lt: "is below", between: "is between", outside: "is outside", rise: "rises by more than", drop: "drops by more than" };
  var EVAL = { live: "Every reading (15 s)", avg15: "15-minute average", hour: "Hourly total / average", day: "Daily total / average" };
  var SEV = { Critical: ["danger", "--rose"], Warning: ["warn", "--amber"], Info: ["info", "--cyan"] };
  var CHANNELS = { app: "In-app", email: "Email", sms: "SMS", whatsapp: "WhatsApp", webhook: "Webhook" };

  function fmt(n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function val(p, v) { return (p.pre ? p.unit : "") + fmt(v, p.d > 1 ? 2 : p.d === 0 ? 0 : 1).replace(/\.0+$/, "") + (p.pre || !p.unit ? "" : p.unit === "%" ? "%" : " " + p.unit); }
  function rowText(r) {
    var p = PARAMS[r.param]; if (!p) return "";
    if (r.op === "between" || r.op === "outside") return p.label + " " + OPS[r.op] + " " + val(p, r.v1) + " and " + val(p, r.v2);
    if (r.op === "rise" || r.op === "drop") return p.label + " " + OPS[r.op] + " " + fmt(r.v1) + "%";
    return p.label + " " + OPS[r.op] + " " + val(p, r.v1);
  }
  function dayRange(days) {
    if (days.length === 7) return "every day";
    if (days.join() === "Mon,Tue,Wed,Thu,Fri") return "Mon–Fri";
    if (days.join() === "Mon,Tue,Wed,Thu,Fri,Sat") return "Mon–Sat";
    return days.join(", ");
  }
  function activeText(a) {
    if (a.mode === "shifts") return a.shifts.map(function (s) { return s === "G" ? "General" : "Shift " + s; }).join(", ");
    if (a.mode === "slots") return a.slots.join(", ");
    if (a.mode === "hours") return a.from + "–" + a.to + (a.to < a.from ? " (+1)" : "") + " · " + dayRange(a.days);
    return "Always";
  }
  function condText(r) {
    var c = r.cond, t = c.mode === "expr" ? c.expr : c.rows.map(rowText).join(c.match === "any" ? " or " : " and ");
    if (c.hold) t += " for " + c.hold + " min";
    if (r.evaluate && r.evaluate !== "live") t += " · " + EVAL[r.evaluate].toLowerCase();
    return t;
  }
  // Short label for the "Metric" column: the parameters a rule watches
  function metricText(r) {
    if (r.cond.mode === "expr") return "Expression";
    var seen = [];
    r.cond.rows.forEach(function (row) { var p = PARAMS[row.param]; if (p && seen.indexOf(p.label) < 0) seen.push(p.label); });
    return seen.join(" + ") || "—";
  }
  function channelsText(list) { return list.map(function (c) { return CHANNELS[c] || c; }).join(" · "); }

  window.EDRules = { PARAMS: PARAMS, OPS: OPS, EVAL: EVAL, SEV: SEV, CHANNELS: CHANNELS, fmt: fmt,
    rowText: rowText, condText: condText, activeText: activeText, dayRange: dayRange, metricText: metricText, channelsText: channelsText };
})();
