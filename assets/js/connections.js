/* ==========================================================================
   Energy Dashboard — Connections (connections.html)
   A Node-RED-style editor for how readings travel:
     Sub-meter → Meter → Device (gateway / logger) → Energy Cloud
   plus Virtual meters (Σ) that add up meters / sub-meters.
   The graph must stay acyclic: any wire that would close a loop is refused.
   Starts from the device + meter registry; "Deploy" saves the flow per tenant.
   Focus: connections.html?focus=GW-01 (or the "Show" picker) shows one device / meter
   with everything upstream and downstream of it, laid out on its own.
   Embed: <div id="flow" data-embed="1" data-focus="MTR-1001"> on device / meter pages —
   the same focused view, read-only, with a link to edit it here.
   ========================================================================== */
(function () {
  var S = window.EDStore, host = document.getElementById("flow");
  if (!S || !host) return;
  var sess = S.session();
  if (sess.status !== "ok") return;
  var ORG = sess.tenant.id;
  var EMBED = host.getAttribute("data-embed") === "1";
  var focus = (host.getAttribute("data-focus") || new URLSearchParams(location.search).get("focus") || "").toUpperCase() || null;
  var lp = {};    // positions used while focused (the whole-flow layout is left alone)
  var extra = {}; // nodes added while focused stay visible even before they are wired
  var hoverId = null;   // node under the pointer: its lines are highlighted, the rest fade

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- node types and the rules between them ---------- */
  var TYPES = {
    submeter: { label: "Sub-meter", icon: "i-layers", color: "--violet", in: false, out: true, hint: "A circuit measured under a meter" },
    meter: { label: "Meter", icon: "i-gauge", color: "--cyan", in: true, out: true, hint: "An energy meter on a Modbus address" },
    virtual: { label: "Virtual meter", icon: "i-spark", color: "--amber", in: true, out: true, hint: "Adds up the meters wired into it (Σ)" },
    device: { label: "Device", icon: "i-cpu", color: "--blue", in: true, out: true, hint: "Gateway or data logger that polls meters" },
    cloud: { label: "Energy Cloud", icon: "i-globe", color: "--green", in: true, out: false, hint: "Where readings are stored and alerts run" },
  };
  var ORDER = ["submeter", "meter", "virtual", "device", "cloud"];
  // Which node types each type may send its readings to
  var FEEDS = { submeter: ["meter", "device", "virtual"], meter: ["device", "virtual"], virtual: ["virtual", "cloud"], device: ["cloud"], cloud: [] };
  // At most one outgoing wire to each of these target types: a meter reports through one device;
  // a sub-meter sits under one meter and is read by one device
  var ONE = { submeter: ["meter", "device"], meter: ["device"], device: ["cloud"] };
  // Line styles (as drawn on paper): solid = device ↔ meter, dotted = meter ↔ its sub-meter,
  // dashed = the device that reads the sub-meter (it can be a different device from its meter's)
  var KINDS = {
    direct: { label: "Meter → device", hint: "The device polls this meter" },
    link: { label: "Sub-meter → device", hint: "The device that reads this sub-meter" },
    sub: { label: "Sub-meter of a meter", hint: "This sub-meter measures a circuit under the meter" },
  };
  var W = 172, H = 60;

  var nodes = [], wires = [], byId = {};
  var sel = null; // { kind: "node" | "wire", id }
  var view = { x: 20, y: 20, k: 1 };
  var deployed = "";

  /* ---------- starting flow from the registry ---------- */
  function fromRegistry() {
    var n = [], w = [];
    n.push({ id: "CLOUD", type: "cloud", name: "Energy Cloud", ref: null });
    (window.ED_DEVICES || []).forEach(function (d) {
      n.push({ id: d.id, type: "device", name: d.name, ref: d.id, fromRegistry: true, props: { model: d.model, ip: d.ip + ":" + d.port, field: d.fieldProtocol, uplink: d.uplink, polling: d.polling } });
      w.push({ from: d.id, to: "CLOUD" });
    });
    var slaves = {}, next = {};
    (window.ED_DEVICES || []).forEach(function (d) { (d.meters || []).forEach(function (m) { slaves[m[0]] = m[1]; next[d.id] = Math.max(next[d.id] || 0, m[1]); }); });
    // Demo: Emergency lighting sits under Lighting (GW-01) but is read by the DG & EV Yard Gateway (like M5 in the sketch)
    var readBy = { "SM-1005-06": "GW-06" };
    (window.ED_METERS || []).forEach(function (m) {
      n.push({ id: m.id, type: "meter", name: m.name, ref: m.id, fromRegistry: true, props: { location: m.location, model: m.model } });
      if (m.device) w.push({ from: m.id, to: m.device, slave: slaves[m.id] || null });
      (m.subs || []).forEach(function (s) {
        n.push({ id: s.id, type: "submeter", name: s.name, ref: s.id, fromRegistry: true, props: { ct: s.ct || "" } });
        w.push({ from: s.id, to: m.id });
        var dev = readBy[s.id] || m.device;
        if (dev) { next[dev] = (next[dev] || 0) + 1; w.push({ from: s.id, to: dev, slave: next[dev] }); }
      });
    });
    return { nodes: n, wires: w };
  }
  function load(f) {
    nodes = f.nodes; index();
    wires = f.wires.filter(function (w) { var a = byId[w.from], b = byId[w.to]; return a && b && FEEDS[a.type].indexOf(b.type) > -1; });
    nodes.filter(function (n) { return n.type === "submeter"; }).forEach(function (sm) {
      if (wires.some(function (w) { return w.from === sm.id && byId[w.to].type === "device"; })) return;
      var m = wires.filter(function (w) { return w.from === sm.id && byId[w.to].type === "meter"; })[0];
      var d = m && wires.filter(function (w) { return w.from === m.to && byId[w.to].type === "device"; })[0];
      if (d) wires.push({ from: sm.id, to: d.to });
    });
    if (nodes.some(function (n) { return n.x == null; })) arrange();
  }
  function index() { byId = {}; nodes.forEach(function (n) { byId[n.id] = n; }); }
  function snapshot() { return JSON.stringify({ nodes: nodes, wires: wires }); }

  /* ---------- positions (whole flow vs focused view) ---------- */
  function X(n) { return focus && n.id && lp[n.id] ? lp[n.id].x : n.x; }
  function Y(n) { return focus && n.id && lp[n.id] ? lp[n.id].y : n.y; }
  function setXY(n, x, y) { if (focus) lp[n.id] = { x: x, y: y }; else { n.x = x; n.y = y; } }
  // Focused: the node, everything that feeds it and everything it feeds
  function visible() {
    if (!focus || !byId[focus]) return null;
    var set = {};
    function walk(id, dir) { if (set[id + dir]) return; set[id + dir] = 1; set[id] = 1; (dir === "up" ? ins(id) : outs(id)).forEach(function (w) { walk(dir === "up" ? w.from : w.to, dir); }); }
    walk(focus, "up"); walk(focus, "down");
    Object.keys(extra).forEach(function (id) { if (byId[id]) set[id] = 1; });
    return set;
  }
  function shown() {
    var v = visible();
    return nodes.filter(function (n) { return (!v || v[n.id]) && true; });
  }
  function shownSet() { var set = {}; shown().forEach(function (n) { set[n.id] = true; }); return set; }

  /* ---------- graph helpers ---------- */
  function outs(id) { return wires.filter(function (w) { return w.from === id; }); }
  function ins(id) { return wires.filter(function (w) { return w.to === id; }); }
  // Path of node ids from a to b following wires, or null
  function path(a, b) {
    var prev = {}, queue = [a], seen = {};
    seen[a] = true;
    while (queue.length) {
      var cur = queue.shift();
      if (cur === b) { var p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p; }
      outs(cur).forEach(function (w) { if (!seen[w.to]) { seen[w.to] = true; prev[w.to] = cur; queue.push(w.to); } });
    }
    return null;
  }
  function name(id) { return byId[id] ? byId[id].name : id; }
  function kindOf(w) { var a = byId[w.from], b = byId[w.to]; return a && b && a.type === "submeter" ? (b.type === "meter" ? "sub" : b.type === "device" ? "link" : "direct") : "direct"; }
  // Can a wire go from a to b? { ok } or { ok: false, reason, loop }
  function check(a, b) {
    var A = byId[a], B = byId[b];
    if (!A || !B) return { ok: false, reason: "Pick two nodes." };
    if (a === b) return { ok: false, reason: "A node can't connect to itself." };
    if (!TYPES[A.type].out) return { ok: false, reason: TYPES[A.type].label + " only receives readings." };
    if (!TYPES[B.type].in) return { ok: false, reason: TYPES[B.type].label + " nodes don't take inputs." };
    if (FEEDS[A.type].indexOf(B.type) < 0) {
      var ok = FEEDS[A.type].map(function (t) { var l = t === "cloud" ? TYPES[t].label : TYPES[t].label.toLowerCase(); return (/^[aeiou]/i.test(l) ? "an " : "a ") + l; });
      return { ok: false, reason: TYPES[A.type].label + " can only connect to " + ok.join(" or ") + "." };
    }
    if (wires.some(function (w) { return w.from === a && w.to === b; })) return { ok: false, reason: "These two are already connected." };
    if ((ONE[A.type] || []).indexOf(B.type) > -1) {
      var cur = outs(a).filter(function (w) { return byId[w.to] && byId[w.to].type === B.type; })[0];
      if (cur) return { ok: false, reason: A.type === "submeter" && B.type === "meter" ? A.name + " is already under " + name(cur.to) + ". Remove that line first."
        : A.type === "submeter" ? A.name + " is already read by " + name(cur.to) + ". Remove that line first." : A.name + " already reports through " + name(cur.to) + ". Remove that line first." };
    }
    var back = path(b, a);
    if (back) return { ok: false, loop: back.concat([b]), reason: "That would make a loop: " + [A.name].concat(back.map(name)).join(" → ") + ". Readings must flow one way." };
    return { ok: true };
  }
  // Belt and braces: is the whole graph free of cycles? (Kahn's algorithm)
  function acyclic() {
    var deg = {}, q = [], seen = 0;
    nodes.forEach(function (n) { deg[n.id] = 0; });
    wires.forEach(function (w) { deg[w.to]++; });
    nodes.forEach(function (n) { if (!deg[n.id]) q.push(n.id); });
    while (q.length) { var id = q.shift(); seen++; outs(id).forEach(function (w) { if (!--deg[w.to]) q.push(w.to); }); }
    return seen === nodes.length;
  }
  function reachesCloud(id) { return nodes.some(function (n) { return n.type === "cloud" && path(id, n.id); }); }
  function issues() {
    var list = [];
    shown().forEach(function (n) {
      if (n.type === "submeter" && !outs(n.id).some(function (w) { return byId[w.to].type === "meter"; })) list.push([n.id, n.name + " isn't under any meter."]);
      else if (n.type === "submeter" && !outs(n.id).some(function (w) { return byId[w.to].type === "device"; })) list.push([n.id, n.name + " isn't read by any device, so its readings aren't collected."]);
      else if (n.type === "meter" && !outs(n.id).some(function (w) { return byId[w.to].type === "device"; })) list.push([n.id, n.name + " has no device, so its readings aren't collected."]);
      else if (n.type === "device" && !outs(n.id).length) list.push([n.id, n.name + " isn't sending to the Energy Cloud."]);
      else if (n.type === "virtual" && !ins(n.id).length) list.push([n.id, n.name + " has nothing wired into it."]);
      else if (n.type === "virtual" && !reachesCloud(n.id)) list.push([n.id, n.name + " doesn't reach the Energy Cloud."]);
    });
    if (!nodes.some(function (n) { return n.type === "cloud"; })) list.unshift([null, "There is no Energy Cloud node. Add one from the palette."]);
    return list;
  }

  /* ---------- layout ---------- */
  // Top-down like the sketch: Energy Cloud, devices, their meters, and each meter's sub-meters
  // in a small grid underneath it (up to 3 across)
  function arrange() {
    var list = shown(), inView = {}, placed = {};
    list.forEach(function (n) { inView[n.id] = true; });
    var CW = W + 36, ROW = H + 90, SROW = H + 26, PER = 3, GAPX = 28;
    var yCloud = 30, yDev = yCloud + ROW, yMeter = yDev + ROW, ySub = yMeter + ROW, xCur = 40;
    var from = function (id, type) { return ins(id).map(function (w) { return byId[w.from]; }).filter(function (n) { return inView[n.id] && (!type || n.type === type); }); };
    function hasMeter(sm) { return outs(sm.id).some(function (w) { return byId[w.to] && byId[w.to].type === "meter" && inView[w.to]; }); }
    function block(m) {
      if (placed[m.id]) return;
      var subs = from(m.id, "submeter").filter(function (sm) { return !placed[sm.id]; }), cols = Math.max(1, Math.min(PER, subs.length));
      setXY(m, Math.round(xCur + (cols - 1) * CW / 2), yMeter); placed[m.id] = true;
      subs.forEach(function (sm, i) { setXY(sm, xCur + (i % cols) * CW, ySub + Math.floor(i / cols) * SROW); placed[sm.id] = true; });
      xCur += cols * CW + GAPX;
    }
    function loose(arr) { arr.forEach(function (sm) { if (placed[sm.id]) return; setXY(sm, xCur, ySub); placed[sm.id] = true; xCur += CW + GAPX; }); }
    list.filter(function (n) { return n.type === "device"; }).forEach(function (d) {
      var x0 = xCur, ms = from(d.id, "meter");
      ms.forEach(block);
      loose(from(d.id, "submeter").filter(function (sm) { return !hasMeter(sm); })); // read by this device, meter not shown
      var kids = ms.concat(from(d.id, "submeter")).filter(function (n) { return placed[n.id]; });
      if (xCur === x0) xCur += CW + GAPX;
      var xs = kids.map(function (n) { return X(n); });
      setXY(d, xs.length ? Math.round((Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2) : x0, yDev); placed[d.id] = true;
    });
    list.filter(function (n) { return n.type === "meter"; }).forEach(block);
    loose(list.filter(function (n) { return n.type === "submeter"; }));
    list.filter(function (n) { return n.type === "virtual"; }).forEach(function (v) { setXY(v, xCur, yDev); xCur += CW + GAPX; placed[v.id] = true; });
    var top = list.filter(function (n) { return (n.type === "device" || n.type === "virtual") && placed[n.id]; });
    if (!top.length) top = list.filter(function (n) { return placed[n.id]; });
    var xs = top.map(function (n) { return X(n); });
    var cx = xs.length ? (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 : 40;
    list.filter(function (n) { return n.type === "cloud"; }).forEach(function (c, i) { setXY(c, Math.round(cx) + i * CW, yCloud); });
  }

  /* ---------- DOM ---------- */
  var CANVAS = '<div class="flow__canvas" id="fl-canvas" tabindex="0" aria-label="Connection canvas. Drag nodes; drag from a node\'s top port up to connect it to a meter or device."><div class="flow__world" id="fl-world"><svg class="flow__wires" id="fl-wires" width="1" height="1"></svg><div id="fl-nodes"></div></div>' +
    '<div class="flow__toast" id="fl-toast" role="status" hidden></div></div>';
  var LEGEND = { direct: "Meter → its device", sub: "Sub-meter → its meter", link: "Sub-meter read by another device" };
  var LINES = '<span class="flow__lines">' + ["direct", "sub", "link"].map(function (k) {
      return '<span title="' + KINDS[k].hint + '"><svg width="34" height="10" aria-hidden="true"><path class="fw fw--' + k + '" d="M2,5 H32"></path></svg>' + LEGEND[k] + "</span>";
    }).join("") + '<span class="muted">Point at a box to trace its lines</span></span>';
  var ZOOM = '<div class="flow__zoom"><button type="button" class="icon-btn" data-z="-1" aria-label="Zoom out">−</button><span id="fl-k">100%</span><button type="button" class="icon-btn" data-z="1" aria-label="Zoom in">+</button><button type="button" class="btn btn--sm btn--ghost" data-fit>Fit</button></div>';
  if (EMBED) {
    host.classList.add("flow--embed");
    host.innerHTML = '<div class="flow__main"><div class="flow__bar"><span class="small muted flow__legend">' + LINES + "</span>" + ZOOM + "</div>" +
      CANVAS + '<div class="flow__status" id="fl-status"></div></div>';
  } else {
  host.innerHTML =
    '<aside class="flow__palette" aria-label="Node palette"><div class="flow__ptitle">Nodes</div>' +
    ORDER.map(function (t) {
      return '<button type="button" class="fn fn--pal" draggable="true" data-add="' + t + '" style="--c:var(' + TYPES[t].color + ')" title="' + esc(TYPES[t].hint) + ' · drag onto the canvas or click to add">' +
        '<span class="fn__band"><i class="ic ' + TYPES[t].icon + '"></i></span><span class="fn__label">' + TYPES[t].label + "</span></button>";
    }).join("") +
    '<div class="flow__rules"><strong>Rules</strong><ul>' +
    "<li>Readings flow upwards (arrows) to the device and on to the cloud.</li>" +
    '<li><b class="tc-blue">Blue solid</b>: a meter and the device that polls it.</li>' +
    '<li><b class="tc-violet">Violet dotted</b>: a sub-meter and the meter it sits under.</li>' +
    '<li><b class="tc-amber">Amber dashed</b>: a sub-meter read by a <i>different</i> device from its meter. Each sub-meter box also says which device reads it.</li>' +
    "<li>Virtual meters add up what's wired into them.</li>" +
    "<li><b>No loops.</b> A wire that would lead back to where it started is refused.</li></ul></div></aside>" +
    '<div class="flow__main">' +
    '<div class="flow__bar">' +
    '<label class="search flow__search"><i class="ic i-search"></i><input type="search" id="fl-find" placeholder="Find a node…" aria-label="Find a node" list="fl-names" /></label><datalist id="fl-names"></datalist>' +
    ZOOM +
    '<button type="button" class="btn btn--sm btn--ghost btn--icon" data-arrange title="Arrange automatically" aria-label="Arrange automatically"><i class="ic i-grid"></i></button>' +
    '<button type="button" class="btn btn--sm btn--ghost btn--icon" data-reset title="Rebuild from the registry" aria-label="Rebuild from the registry"><i class="ic i-refresh"></i></button>' +
    '<button type="button" class="btn btn--sm btn--primary" data-deploy><i class="ic i-send"></i> <span>Deploy</span></button>' +
    '<div class="flow__bar2 small muted">' + LINES + "</div></div>" +
    CANVAS +
    '<div class="flow__status" id="fl-status"></div></div>' +
    '<aside class="flow__inspect" id="fl-inspect" aria-label="Details"></aside>';

  }
  var canvas = $("#fl-canvas"), world = $("#fl-world"), svg = $("#fl-wires"), layer = $("#fl-nodes"), inspect = $("#fl-inspect");

  // a sends to b: from a's top port up to b's bottom port
  function outPort(n) { return { x: X(n) + W / 2, y: Y(n) }; }
  function inPort(n) { return { x: X(n) + W / 2, y: Y(n) + H }; }
  function curve(p, q) {
    var dy = Math.max(40, Math.abs(p.y - q.y) / 2);
    return "M" + p.x + "," + p.y + " C" + p.x + "," + (p.y - dy) + " " + q.x + "," + (q.y + dy) + " " + q.x + "," + q.y;
  }
  function wirePath(a, b) {
    return curve(outPort(a), inPort(b));
  }
  // The device that reads a sub-meter, and whether that just repeats its meter's device
  function readerOf(id) { var w = outs(id).filter(function (x) { return byId[x.to] && byId[x.to].type === "device"; })[0]; return w ? byId[w.to] : null; }
  function meterOf(id) { var w = outs(id).filter(function (x) { return byId[x.to] && byId[x.to].type === "meter"; })[0]; return w ? byId[w.to] : null; }
  function repeatsMeter(w) {
    if (kindOf(w) !== "link") return false;
    var m = meterOf(w.from), d = m && readerOf(m.id);
    return !!d && d.id === w.to;
  }
  function active() { return hoverId || (sel && sel.kind === "node" ? sel.id : null); }
  var ARROWS = '<defs>' + ["direct", "sub", "link"].map(function (k) {
      return '<marker id="ah-' + k + '" class="ah ah--' + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"></path></marker>';
    }).join("") + "</defs>";
  function drawWires() {
    var v = shownSet(), act = active();
    svg.innerHTML = ARROWS + wires.map(function (w, i) {
      var a = byId[w.from], b = byId[w.to];
      if (!a || !b || !(v[a.id] && v[b.id])) return "";
      var touch = act && (w.from === act || w.to === act), on = sel && sel.kind === "wire" && sel.id === i;
      if (repeatsMeter(w) && act !== w.from && !on) return "";
      var k = kindOf(w), d = wirePath(a, b);
      return '<path class="fw-hit" d="' + d + '" data-wire="' + i + '"></path><path class="fw fw--' + k + (on ? " is-sel" : "") + (touch ? " is-hl" : act && !on ? " is-dim" : "") + '" d="' + d + '" marker-end="url(#ah-' + k + ')"></path>';
    }).join("") + '<path class="fw fw--temp" id="fl-temp" d="" hidden></path>';
    dimNodes(act);
  }
  // Fade the boxes that aren't connected to the one being traced
  function dimNodes(act) {
    var near = {};
    if (act) { near[act] = true; wires.forEach(function (w) { if (w.from === act) near[w.to] = true; if (w.to === act) near[w.from] = true; }); }
    $$(".fn", layer).forEach(function (el) { el.classList.toggle("is-dim", !!act && !near[el.getAttribute("data-node")]); });
  }
  function setHover(id) { if (id === hoverId) return; hoverId = id; drawWires(); }
  function nodeHtml(n) {
    var t = TYPES[n.type], isSel = sel && sel.kind === "node" && sel.id === n.id;
    var warn = issueIds[n.id];
    return '<div class="fn fn--' + n.type + (isSel ? " is-sel" : "") + (warn ? " is-warn" : "") + (n.id === focus ? " is-focus" : "") + '" data-node="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(t.label + " " + n.name) + '" style="--c:var(' + t.color + ');left:' + X(n) + "px;top:" + Y(n) + 'px">' +
      (t.out && !EMBED ? '<span class="fn__port fn__port--out" data-port="out" title="Drag up to the device or meter it reports to"></span>' : "") +
      '<span class="fn__head"><i></i><i></i><i class="ic ' + t.icon + '"></i></span><span class="fn__label"><b>' + esc(n.name) + "</b><small>" + esc(n.ref || (n.type === "cloud" ? "platform" : "new")) + (n.type === "submeter" && readerOf(n.id) ? " · via " + esc(readerOf(n.id).ref || readerOf(n.id).name) : "") + "</small></span>" +
      (warn ? '<i class="ic i-alert fn__warn" title="' + esc(warn) + '"></i>' : "") +
      (t.in && !EMBED ? '<span class="fn__port fn__port--in" data-port="in" title="Drag down to a meter to connect it here"></span>' : "") + "</div>";
  }
  var issueIds = {};
  function render() {
    var list = issues();
    issueIds = {};
    list.forEach(function (i) { if (i[0]) issueIds[i[0]] = i[1]; });
    var list2 = shown(), v = visible();
    layer.innerHTML = list2.map(nodeHtml).join("");
    drawWires();
    applyView();
    var loops = !acyclic();
    var vs = shownSet(), nWires = wires.filter(function (w) { return vs[w.from] && vs[w.to]; }).length;
    var counts = ORDER.map(function (t) { var c = list2.filter(function (n) { return n.type === t; }).length; return c ? c + " " + TYPES[t].label.toLowerCase() + (c === 1 ? "" : "s") : ""; }).filter(Boolean).join(" · ");
    if (EMBED) {
      var f = byId[focus];
      $("#fl-status").innerHTML = (loops ? '<span class="tc-rose"><i class="ic i-alert"></i> The flow has a loop</span>' : '<span class="tc-green"><i class="ic i-check"></i> No loops</span>') +
        "<span>" + counts + "</span>" +
        (!f ? '<span class="tc-amber">Not in the deployed flow</span>' : f.type === "cloud" || reachesCloud(focus) ? '<span class="tc-green">Reaches the Energy Cloud</span>' : '<span class="tc-amber"><i class="ic i-alert"></i> Doesn\'t reach the Energy Cloud</span>') +
        '<span class="muted">Double-click a node to open it</span>';
      return;
    }
    renderInspector(list);
    var dirty = snapshot() !== deployed, dep = $("[data-deploy]", host);
    dep.classList.toggle("is-dirty", dirty);
    $("span", dep).textContent = dirty ? "Deploy changes" : "Deployed";
    $("#fl-status").innerHTML = (loops ? '<span class="tc-rose"><i class="ic i-alert"></i> The flow has a loop</span>' : '<span class="tc-green"><i class="ic i-check"></i> No loops</span>') +
      "<span>" + (v ? "Showing " + esc(name(focus)) + " · " + list2.length + " of " + nodes.length + " nodes · " + nWires + " wires" : nodes.length + " nodes · " + wires.length + " wires") + "</span>" +
      (list.length ? '<button type="button" class="linklike tc-amber" data-show-issues>' + list.length + " warning" + (list.length === 1 ? "" : "s") + "</button>" : '<span class="tc-green">Everything reaches the cloud</span>') +
      '<span class="muted">' + (dirty ? "Unsaved changes" : S.flow(ORG) ? "Deployed " + new Date(S.flow(ORG).deployedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Built from the device and meter registry") + "</span>";
    fillShow();
    $("#fl-names").innerHTML = list2.map(function (n) { return '<option value="' + esc(n.name) + '">' + esc(n.ref || "") + "</option>"; }).join("");
  }
  // "Show" picker: whole flow, or one device / meter / sub-meter / virtual meter
  function fillShow() {
    var el = $("#fl-show");
    if (!el) return;
    var opt = function (n, pre) { return '<option value="' + esc(n.id) + '"' + (n.id === focus ? " selected" : "") + ">" + (pre || "") + esc(n.name) + (n.ref ? " · " + esc(n.ref) : "") + "</option>"; };
    var group = function (label, list) { return list.length ? '<optgroup label="' + label + '">' + list.join("") + "</optgroup>" : ""; };
    var devs = nodes.filter(function (n) { return n.type === "device"; }).map(function (n) { return opt(n); });
    var ms = [];
    nodes.filter(function (n) { return n.type === "meter"; }).forEach(function (m) {
      ms.push(opt(m));
      ins(m.id).forEach(function (w) { if (byId[w.from] && byId[w.from].type === "submeter") ms.push(opt(byId[w.from], "↳ ")); });
    });
    nodes.filter(function (n) { return n.type === "submeter" && !outs(n.id).length; }).forEach(function (n) { ms.push(opt(n, "↳ ")); });
    var vs = nodes.filter(function (n) { return n.type === "virtual"; }).map(function (n) { return opt(n); });
    el.innerHTML = '<option value="">Whole flow</option>' + group("Devices", devs) + group("Meters", ms) + group("Virtual meters", vs);
    el.value = focus || "";
  }
  function setFocus(id) {
    focus = id && byId[id] ? id : null;
    lp = {}; extra = {};
    sel = null;
    if (focus) arrange();
    if (!EMBED) history.replaceState(null, "", location.pathname + (focus ? "?focus=" + encodeURIComponent(focus) : ""));
    render();
    fit(focus ? 0.55 : 0.7);
  }
  function applyView() {
    world.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.k + ")";
    canvas.style.backgroundSize = 24 * view.k + "px " + 24 * view.k + "px";
    canvas.style.backgroundPosition = view.x + "px " + view.y + "px";
    $("#fl-k").textContent = Math.round(view.k * 100) + "%";
  }

  /* ---------- inspector ---------- */
  function row(k, v) { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; }
  function renderInspector(list) {
    if (!inspect) return;
    if (sel && sel.kind === "node" && byId[sel.id]) {
      var n = byId[sel.id], t = TYPES[n.type], p = n.props || {};
      var link = n.type === "device" && n.ref ? "device.html?id=" + encodeURIComponent(n.ref) : (n.type === "meter" || n.type === "submeter") && n.ref ? "meter.html?id=" + encodeURIComponent(n.ref) : null;
      var conn = function (arr, dir) {
        return arr.length ? arr.map(function (w) {
          var o = byId[dir === "in" ? w.from : w.to], i = wires.indexOf(w);
          return '<li><svg width="22" height="8" aria-hidden="true"><path class="fw fw--' + kindOf(w) + '" style="--c:var(' + TYPES[byId[w.from].type].color + ')" d="M1,4 H21"></path></svg><button type="button" class="linklike" data-goto="' + esc(o.id) + '">' + esc(o.name) + '</button> <small class="muted">' + TYPES[o.type].label + (w.slave ? " · slave " + w.slave : "") + '</small><button type="button" class="act act--del" data-unwire="' + i + '" title="Remove this wire"><i class="ic i-x"></i></button></li>';
        }).join("") : '<li class="muted small">None</li>';
      };
      inspect.innerHTML = '<div class="fi__head" style="--c:var(' + t.color + ')"><span class="fn__band"><i class="ic ' + t.icon + '"></i></span><div><small>' + t.label + "</small><strong>" + esc(n.name) + "</strong></div></div>" +
        (issueIds[n.id] ? '<div class="callout callout--warn" style="margin-bottom:12px"><i class="ic i-alert"></i><span>' + esc(issueIds[n.id]) + "</span></div>" : "") +
        '<div class="field"><label for="fi-name">Name</label><input id="fi-name" class="input input--sm" value="' + esc(n.name) + '" /></div>' +
        (n.type !== "cloud" ? '<div class="field"><label for="fi-ref">ID</label><input id="fi-ref" class="input input--sm mono" value="' + esc(n.ref || "") + '"' + (n.fromRegistry ? " readonly" : "") + ' placeholder="e.g. MTR-1013" /></div>' : "") +
        (Object.keys(p).length ? '<dl class="kv fi__kv">' + Object.keys(p).filter(function (k) { return p[k]; }).map(function (k) { return row({ model: "Model", ip: "Address", field: "Field bus", uplink: "Uplink", polling: "Polling", location: "Location", ct: "CT" }[k] || k, esc(p[k])); }).join("") + "</dl>" : "") +
        (t.in ? '<div class="fi__sec">Receives from</div><ul class="fi__list">' + conn(ins(n.id), "in") + "</ul>" : "") +
        (t.out ? '<div class="fi__sec">Sends to</div><ul class="fi__list">' + conn(outs(n.id), "out") + "</ul>" : "") +
        (n.type === "meter" || n.type === "submeter" ? slaveField(n) : "") +
        '<div class="fi__actions">' + (link ? '<a href="' + link + '" class="btn btn--sm btn--ghost"><i class="ic i-arrow-right"></i> Open</a>' : "") +
        '<button type="button" class="btn btn--sm tc-rose" data-del-node><i class="ic i-trash"></i> Delete node</button></div>';
      return;
    }
    if (sel && sel.kind === "wire" && wires[sel.id]) {
      var w = wires[sel.id], a = byId[w.from], b = byId[w.to];
      inspect.innerHTML = '<div class="fi__head" style="--c:var(' + TYPES[a.type].color + ')"><span class="fn__band"><i class="ic i-arrow-right"></i></span><div><small>Wire</small><strong>' + esc(a.name) + " → " + esc(b.name) + "</strong></div></div>" +
        '<p class="small muted">' + esc(TYPES[a.type].label) + " readings go to this " + esc(TYPES[b.type].label.toLowerCase()) + ".</p>" +
        '<div class="field"><label>Line</label><div class="small"><svg width="30" height="8" aria-hidden="true"><path class="fw fw--' + kindOf(w) + '" d="M1,4 H29"></path></svg> ' +
          KINDS[kindOf(w)].label + " · " + { direct: "solid", link: "dashed", sub: "dotted" }[kindOf(w)] + '</div><span class="hint">' + KINDS[kindOf(w)].hint + "</span></div>" +
        ((a.type === "meter" || a.type === "submeter") && b.type === "device" ? '<div class="field"><label for="fi-slave">Modbus slave ID</label><input id="fi-slave" type="number" min="1" max="247" class="input input--sm mono" value="' + esc(w.slave || "") + '" /><span class="hint">1–247, unique on this device</span></div>' : "") +
        '<div class="fi__actions"><button type="button" class="btn btn--sm tc-rose" data-del-wire><i class="ic i-trash"></i> Remove wire</button></div>';
      return;
    }
    var count = function (t) { return nodes.filter(function (n) { return n.type === t; }).length; };
    inspect.innerHTML = '<div class="fi__head"><span class="fn__band" style="--c:var(--primary)"><i class="ic i-flow"></i></span><div><small>Flow</small><strong>' + esc(sess.tenant.name) + "</strong></div></div>" +
      '<dl class="kv fi__kv">' + ORDER.map(function (t) { return row(TYPES[t].label + "s", count(t)); }).join("") + row("Wires", wires.length) + "</dl>" +
      '<div class="fi__sec">Warnings</div>' +
      (list.length ? '<ul class="fi__list fi__issues">' + list.map(function (i) { return "<li>" + (i[0] ? '<button type="button" class="linklike" data-goto="' + esc(i[0]) + '">' + esc(i[1]) + "</button>" : esc(i[1])) + "</li>"; }).join("") + "</ul>"
        : '<p class="small tc-green"><i class="ic i-check"></i> Every meter reaches the Energy Cloud and there are no loops.</p>') +
      '<p class="small muted" style="margin-top:14px">Select a node or line to see its details. Drag a meter\'s top port up to its device. Drag a sub-meter\'s top port up to its meter (dotted) and to the device that reads it (dashed). You can also drag down from a bottom port. <kbd>Delete</kbd> removes the selection.</p>';
  }
  function slaveField(n) {
    var w = outs(n.id).filter(function (x) { return byId[x.to].type === "device"; })[0];
    if (!w) return "";
    return '<div class="field" style="margin-top:12px"><label for="fi-slave">Modbus slave ID on ' + esc(name(w.to)) + '</label><input id="fi-slave" type="number" min="1" max="247" class="input input--sm mono" data-wire-index="' + wires.indexOf(w) + '" value="' + esc(w.slave || "") + '" /></div>';
  }

  /* ---------- editing ---------- */
  var toastTimer;
  function toast(msg, bad) {
    var t = $("#fl-toast");
    t.innerHTML = '<i class="ic ' + (bad ? "i-alert" : "i-check") + '"></i> ' + esc(msg);
    t.className = "flow__toast" + (bad ? " is-bad" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 6000 : 2500);
  }
  function select(s) { sel = s; render(); }
  function connect(a, b) {
    var c = check(a, b);
    if (!c.ok) {
      toast(c.reason, true);
      if (c.loop) flashLoop(c.loop);
      return false;
    }
    var w = { from: a, to: b };
    if ((byId[a].type === "meter" || byId[a].type === "submeter") && byId[b].type === "device") w.slave = nextSlave(b);
    wires.push(w);
    select({ kind: "wire", id: wires.length - 1 });
    toast({ sub: name(a) + " is now under " + name(b), link: name(a) + " is now read by " + name(b), direct: "Connected " + name(a) + " → " + name(b) }[kindOf(w)]);
    return true;
  }
  function nextSlave(dev) { var used = ins(dev).map(function (w) { return w.slave || 0; }); var s = 1; while (used.indexOf(s) > -1) s++; return s; }
  function flashLoop(ids) {
    ids.forEach(function (id) { var el = $('[data-node="' + CSS.escape(id) + '"]', layer); if (el) el.classList.add("is-loop"); });
    setTimeout(function () { $$(".is-loop", layer).forEach(function (el) { el.classList.remove("is-loop"); }); }, 2200);
  }
  function removeWire(i) { wires.splice(i, 1); sel = null; render(); }
  function removeNode(id) {
    var n = byId[id];
    if (!n) return;
    wires = wires.filter(function (w) { return w.from !== id && w.to !== id; });
    nodes = nodes.filter(function (x) { return x.id !== id; });
    index(); sel = null; render();
    toast("Removed " + n.name);
  }
  var seq = 0;
  function addNode(type, x, y) {
    if (type === "cloud" && nodes.some(function (n) { return n.type === "cloud"; })) { toast("There is already an Energy Cloud node.", true); return; }
    var id;
    do { id = "N" + Date.now().toString(36).slice(-4).toUpperCase() + (++seq); } while (byId[id]);
    var count = nodes.filter(function (n) { return n.type === type; }).length + 1;
    var n = { id: id, type: type, name: type === "cloud" ? "Energy Cloud" : "New " + TYPES[type].label.toLowerCase() + " " + count, ref: "", x: Math.round(x), y: Math.round(y) };
    nodes.push(n); index();
    if (focus) { extra[id] = true; lp[id] = { x: n.x, y: n.y }; }
    select({ kind: "node", id: id });
    var nm = $("#fi-name"); if (nm) { nm.focus(); nm.select(); }
  }
  function toWorld(cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; }
  function zoomAt(k, cx, cy) {
    k = Math.min(2, Math.max(0.25, k));
    var r = canvas.getBoundingClientRect(), px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    view.x = px - (px - view.x) * k / view.k; view.y = py - (py - view.y) * k / view.k; view.k = k;
    applyView();
  }
  // Fit everything in view; minK keeps the first view readable on big flows (it then starts at the top)
  function fit(minK) {
    if (!nodes.length) return;
    var r = canvas.getBoundingClientRect(), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (r.width < 700) minK = Math.min(minK || 0.25, 0.3); // phones: show more of the diagram at once
    shown().forEach(function (n) { x0 = Math.min(x0, X(n)); y0 = Math.min(y0, Y(n)); x1 = Math.max(x1, X(n) + W); y1 = Math.max(y1, Y(n) + H); });
    if (x0 === Infinity) return;
    var k = Math.min(1.2, Math.max(minK || 0.25, Math.min((r.width - 60) / (x1 - x0), (r.height - 60) / (y1 - y0))));
    view.k = k; view.x = Math.max(20, (r.width - (x1 - x0) * k) / 2) - x0 * k; view.y = Math.max(20, (r.height - (y1 - y0) * k) / 2) - y0 * k;
    applyView();
  }
  function focusNode(id) {
    var n = byId[id]; if (!n) return;
    var r = canvas.getBoundingClientRect();
    var v = visible();
    if (v && !v[id]) { setFocus(null); n = byId[id]; }
    view.x = r.width / 2 - (X(n) + W / 2) * view.k; view.y = r.height / 2 - (Y(n) + H / 2) * view.k;
    select({ kind: "node", id: id });
  }

  /* ---------- pointer: drag nodes, draw wires, pan ---------- */
  var drag = null;
  function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } }
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    var port = e.target.closest(".fn__port"), nodeEl = e.target.closest("[data-node]"), hit = e.target.closest("[data-wire]");
    var p = toWorld(e.clientX, e.clientY);
    if (port && nodeEl && !EMBED) {
      var id = nodeEl.getAttribute("data-node");
      drag = port.getAttribute("data-port") === "out" ? { mode: "wire", from: id } : { mode: "wire", to: id, reverse: true };
      $$(".fn", layer).forEach(function (el) {
        var other = el.getAttribute("data-node");
        if (other === id) return;
        el.classList.add((drag.reverse ? check(other, id) : check(id, other)).ok ? "can-drop" : "no-drop");
      });
      drawWires();
      capture(e);
      e.preventDefault();
      return;
    }
    if (nodeEl) {
      var n = byId[nodeEl.getAttribute("data-node")];
      if (!sel || sel.kind !== "node" || sel.id !== n.id) select({ kind: "node", id: n.id });
      drag = { mode: "node", id: n.id, dx: p.x - X(n), dy: p.y - Y(n), moved: false };
      capture(e);
      return;
    }
    if (hit) { select({ kind: "wire", id: +hit.getAttribute("data-wire") }); return; }
    drag = { mode: "pan", sx: e.clientX - view.x, sy: e.clientY - view.y, moved: false };
    capture(e);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = toWorld(e.clientX, e.clientY);
    if (drag.mode === "node") {
      var n = byId[drag.id];
      setXY(n, Math.round((p.x - drag.dx) / 6) * 6, Math.round((p.y - drag.dy) / 6) * 6); drag.moved = true;
      var el = $('[data-node="' + CSS.escape(n.id) + '"]', layer);
      el.style.left = X(n) + "px"; el.style.top = Y(n) + "px";
      drawWires();
    } else if (drag.mode === "wire") {
      var t = $("#fl-temp");
      t.hidden = false;
      t.setAttribute("d", drag.reverse ? curve(p, inPort(byId[drag.to])) : curve(outPort(byId[drag.from]), p));
    } else if (drag.mode === "pan") {
      view.x = e.clientX - drag.sx; view.y = e.clientY - drag.sy; drag.moved = true; applyView();
    }
  });
  function endDrag(e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.mode === "wire") {
      var el = document.elementFromPoint(e.clientX, e.clientY), target = el && el.closest("[data-node]");
      $$(".can-drop, .no-drop", layer).forEach(function (x) { x.classList.remove("can-drop", "no-drop"); });
      var other = target && target.getAttribute("data-node");
      if (other && other !== (d.reverse ? d.to : d.from)) connect(d.reverse ? other : d.from, d.reverse ? d.to : other);
      else drawWires();
    } else if (d.mode === "node" && d.moved) render();
    else if (d.mode === "pan" && !d.moved) select(null);
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () { drag = null; render(); });
  canvas.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(view.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY); }, { passive: false });

  // Palette: drag onto the canvas, or click to add in view
  host.addEventListener("dragstart", function (e) {
    var b = e.target.closest && e.target.closest("[data-add]");
    if (b) e.dataTransfer.setData("text/x-node", b.getAttribute("data-add"));
  });
  canvas.addEventListener("dragover", function (e) { if (e.dataTransfer.types.indexOf("text/x-node") > -1) e.preventDefault(); });
  canvas.addEventListener("drop", function (e) {
    var t = e.dataTransfer.getData("text/x-node");
    if (!TYPES[t]) return;
    e.preventDefault();
    var p = toWorld(e.clientX, e.clientY);
    addNode(t, p.x - W / 2, p.y - H / 2);
  });

  /* ---------- buttons, inspector fields, keyboard ---------- */
  host.addEventListener("click", function (e) {
    var b = e.target.closest("button, [data-goto]");
    if (!b) return;
    if (b.hasAttribute("data-add")) { var r = canvas.getBoundingClientRect(), p = toWorld(r.left + r.width / 2, r.top + r.height / 2); addNode(b.getAttribute("data-add"), p.x - W / 2, p.y - H / 2); }
    else if (b.hasAttribute("data-z")) zoomAt(view.k * (b.getAttribute("data-z") === "1" ? 1.2 : 1 / 1.2));
    else if (b.hasAttribute("data-fit")) fit();
    else if (b.hasAttribute("data-arrange")) { arrange(); render(); fit(focus ? 0.55 : 0.7); }
    else if (b.hasAttribute("data-reset")) {
      if (!window.confirm("Throw away every change and rebuild the flow from the device and meter registry?")) return;
      load(fromRegistry()); setFocus(focus);
    } else if (b.hasAttribute("data-deploy")) deploy();
    else if (b.hasAttribute("data-goto")) focusNode(b.getAttribute("data-goto"));
    else if (b.hasAttribute("data-unwire")) removeWire(+b.getAttribute("data-unwire"));
    else if (b.hasAttribute("data-del-node")) removeNode(sel.id);
    else if (b.hasAttribute("data-del-wire")) removeWire(sel.id);
    else if (b.hasAttribute("data-show-issues")) select(null);
  });
  if (inspect) inspect.addEventListener("input", function (e) {
    if (!sel) return;
    if (e.target.id === "fi-name" && sel.kind === "node") {
      byId[sel.id].name = e.target.value.trim() || byId[sel.id].name;
      var lbl = $('[data-node="' + CSS.escape(sel.id) + '"] .fn__label b', layer); if (lbl) lbl.textContent = byId[sel.id].name;
    }
  });
  if (inspect) inspect.addEventListener("change", function (e) {
    if (!sel) return;
    if (e.target.id === "fi-ref" && sel.kind === "node") { byId[sel.id].ref = e.target.value.trim().toUpperCase(); render(); }
    if (e.target.id === "fi-name") render();
    if (e.target.id === "fi-slave") {
      var i = e.target.hasAttribute("data-wire-index") ? +e.target.getAttribute("data-wire-index") : sel.id, w = wires[i], v = Math.round(+e.target.value);
      if (!(v >= 1 && v <= 247)) { toast("Slave ID must be 1–247.", true); render(); return; }
      if (ins(w.to).some(function (x) { return x !== w && x.slave === v; })) { toast("Slave ID " + v + " is already used on " + name(w.to) + ".", true); render(); return; }
      w.slave = v; render();
    }
  });
  canvas.addEventListener("keydown", function (e) {
    if (!sel) return;
    if ((e.key === "Delete" || e.key === "Backspace") && !EMBED) { e.preventDefault(); if (sel.kind === "node") removeNode(sel.id); else removeWire(sel.id); }
    if (sel.kind === "node" && /^Arrow/.test(e.key)) {
      e.preventDefault();
      var n = byId[sel.id], step = e.shiftKey ? 30 : 6;
      var nx = X(n) + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0), ny = Y(n) + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      setXY(n, nx, ny);
      render(); var el = $('[data-node="' + CSS.escape(n.id) + '"]', layer); if (el) el.focus();
    }
  });
  canvas.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest("[data-node]"); if (el && (!sel || sel.id !== el.getAttribute("data-node"))) { sel = { kind: "node", id: el.getAttribute("data-node") }; renderInspector(issues()); $$(".fn.is-sel", layer).forEach(function (x) { x.classList.remove("is-sel"); }); el.classList.add("is-sel"); } });
  if ($("#fl-show")) $("#fl-show").addEventListener("change", function (e) { setFocus(e.target.value); });
  canvas.addEventListener("pointerover", function (e) {
    if (drag) return;
    var el = e.target.closest && e.target.closest("[data-node]");
    setHover(el ? el.getAttribute("data-node") : null);
  });
  canvas.addEventListener("pointerleave", function () { if (!drag) setHover(null); });
  canvas.addEventListener("dblclick", function (e) {
    var el = e.target.closest("[data-node]"), n = el && byId[el.getAttribute("data-node")];
    if (!n || !n.ref) return;
    if (n.type === "device") location.href = "device.html?id=" + encodeURIComponent(n.ref);
    else if (n.type === "meter" || n.type === "submeter") location.href = "meter.html?id=" + encodeURIComponent(n.ref);
  });
  if ($("#fl-find")) $("#fl-find").addEventListener("change", function (e) {
    var q = e.target.value.trim().toLowerCase();
    var n = nodes.filter(function (x) { return x.name.toLowerCase() === q || (x.ref || "").toLowerCase() === q; })[0] || nodes.filter(function (x) { return (x.name + " " + (x.ref || "")).toLowerCase().indexOf(q) > -1; })[0];
    if (n) focusNode(n.id); else if (q) toast("No node matches “" + e.target.value + "”.", true);
  });

  function deploy() {
    if (!acyclic()) { toast("The flow has a loop, so it can't be deployed.", true); return; }
    S.saveFlow(ORG, { nodes: nodes, wires: wires });
    deployed = snapshot();
    render();
    var n = issues().length;
    toast("Deployed" + (n ? " with " + n + " warning" + (n === 1 ? "" : "s") : ""));
  }
  if (!EMBED) window.addEventListener("beforeunload", function (e) { if (snapshot() !== deployed) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- start ---------- */
  var saved = S.flow(ORG);
  if (saved) { load(saved); deployed = snapshot(); }
  else { load(fromRegistry()); deployed = snapshot(); }
  if (focus && !byId[focus]) {
    if (EMBED) { host.innerHTML = '<p class="small muted" style="padding:18px 22px">This isn\'t in the connection flow yet. <a href="connections.html" class="tc-primary">Open Connections</a> to wire it up.</p>'; return; }
    focus = null;
  }
  if (focus) arrange();
  render();
  requestAnimationFrame(function () { fit(focus ? 0.55 : 0.7); });
})();
