/* ==========================================================================
   Energy Dashboard — browser-only data store (demo mode)
   --------------------------------------------------------------------------
   Tenants, users, sessions and one-time codes live in this browser's
   localStorage / sessionStorage. Passwords are salted and hashed (SHA-256,
   stretched), but anything stored client-side can be read or changed by the
   person using the browser — this is a working demo, not real security.
   A real deployment must move all of this to a server.

   Exposes window.EDStore. Loaded in <head> before app.js on every page.
   ========================================================================== */
(function () {
  var DB_KEY = "ed-db";
  var SESSION_KEY = "ed-session";
  var PENDING_KEY = "ed-pending-";
  var HOUR = 36e5, MIN = 6e4;

  var ROLES = ["Tenant Admin", "Energy Manager", "Supervisor", "Operator", "Technician", "Viewer", "Auditor"];
  var DEPARTMENTS = ["Management", "Production", "Utilities", "Maintenance", "Finance", "Sustainability", "Admin", "HR"];
  var SHIFTS = ["Shift A", "Shift B", "Shift C", "General"];
  var PLANS = {
    starter: { name: "Starter", price: "₹0 / 30-day trial", seats: 5 },
    growth: { name: "Growth", price: "₹4,999 / month", seats: 50 },
    enterprise: { name: "Enterprise", price: "Custom", seats: 1000 },
  };

  /* ---------- SHA-256 (sync, pure JS; input is UTF-8 encoded first) ---------- */
  var SHA_H = [], SHA_K = [];
  (function () {
    var maxWord = Math.pow(2, 32), primes = 0, composite = {};
    for (var c = 2; primes < 64; c++) {
      if (!composite[c]) {
        for (var i = 0; i < 313; i += c) composite[i] = c;
        SHA_H[primes] = (Math.pow(c, 0.5) * maxWord) | 0;
        SHA_K[primes++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    SHA_H = SHA_H.slice(0, 8);
  })();
  function sha256(str) {
    var ascii = unescape(encodeURIComponent(str));
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var maxWord = Math.pow(2, 32), i, j, result = "";
    var words = [], bitLen = ascii.length * 8;
    var hash = SHA_H.slice(0), k = SHA_K;
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? "0" : "") + b.toString(16); }
    return result;
  }

  function randomHex(bytes) {
    var a = new Uint8Array(bytes), out = "";
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < a.length; j++) out += (a[j] < 16 ? "0" : "") + a[j].toString(16);
    return out;
  }
  function randomDigits(n) {
    var s = "";
    while (s.length < n) s += parseInt(randomHex(4), 16).toString().slice(-4);
    return s.slice(0, n);
  }
  function hashPassword(pw, salt) {
    var h = salt + ":" + pw;
    for (var i = 0; i < 400; i++) h = sha256(salt + h);
    return h;
  }
  function makePassword(pw) {
    var salt = randomHex(16);
    return { salt: salt, hash: hashPassword(pw, salt) };
  }

  /* ---------- Storage ---------- */
  function readJSON(store, key) {
    try { return JSON.parse(store.getItem(key) || "null"); } catch (e) { return null; }
  }
  function writeJSON(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  var cache = null;
  function db() {
    if (cache) return cache;
    cache = readJSON(localStorage, DB_KEY);
    if (!cache || cache.v !== 5) { cache = seed(); save(); }
    return cache;
  }
  function save() { writeJSON(localStorage, DB_KEY, cache); }
  // Pick up changes made in another tab
  window.addEventListener("storage", function (e) { if (e.key === DB_KEY) cache = null; });

  /* ---------- Seed: sample energy-monitoring organisations ----------
     Tenant status: "active" (can sign in) · "pending" (awaiting platform-admin
     approval) · "suspended" (blocked by the platform admin).
       FEBINO    Febino Solutions Pvt Ltd  · vijay / Admin@123 (main demo login; team members use Welcome@123)
       SUNGRID   SunGrid Solar Parks       · sungrid_admin / Sungrid@123
       VOLTEDGE  VoltEdge Industries       · voltedge_admin / Voltedge@123
       GREENTECH GreenTech Campus          · greentech_admin / Greentech@123
       HX4R7TQM  Kaveri Textile Mills      · kaveri_admin / Kaveri@123      (pending approval)
       M8PW3ZKD  Deccan Data Centre        · deccan_admin / Deccan@123      (pending approval)
       Q2LN6VEB  Metro Mall Facilities     · metromall_admin / Metro@123    (suspended)
       Platform admin (Control Center) · superadmin / Control@2026 */
  function seedTenant(id, name, extra) {
    var t = {
      id: id, name: name, slug: slugify(name), industry: "Manufacturing", gstin: "", sites: "1", country: "India",
      timezone: "Asia/Kolkata (UTC+05:30)", address: "", plan: "growth", cycle: "Monthly", contact: "", phone: "",
      city: "", discom: "", contractDemand: 0, meters: "", status: "active", created: Date.now(), approvedAt: Date.now(),
    };
    for (var k in extra) t[k] = extra[k];
    return t;
  }
  function seedAdmin(org, first, last, email, username, pw, created) {
    return {
      id: "u" + randomHex(6), org: org, first: first, last: last, empId: "EMP-001", email: email, username: username,
      role: "Tenant Admin", shift: "General", dept: "Management", status: "active", mobile: "", designation: "Energy Manager",
      created: created, lastActive: null, pw: makePassword(pw), invite: null,
    };
  }
  function seed() {
    var now = Date.now(), day = 24 * HOUR;
    var data = { v: 5, tenants: {}, users: [], platformAdmin: { username: "superadmin", name: "Platform Admin", email: "admin@energydash.io", pw: makePassword("Control@2026") } };
    data.tenants.FEBINO = seedTenant("FEBINO", "Febino Solutions Pvt Ltd", {
      slug: "febino", gstin: "29ABCFE1234F1Z5", sites: "2 – 5", contact: "energy@febinosolutions.com", phone: "9845012345",
      industry: "Manufacturing plant", city: "Bengaluru, Karnataka", discom: "BESCOM", contractDemand: 400, meters: "11-50", address: "Plot 12, Electronic City Phase 1, Bengaluru, Karnataka 560100",
      created: now - 260 * day, approvedAt: now - 259 * day,
    });
    // Other energy-monitoring tenants: [id, name, facility type, admin first, last, email, username, password, site, DISCOM, phone, contract demand kVA, meters, status, days ago]
    [["SUNGRID", "SunGrid Solar Parks", "Solar / renewable plant", "Anil", "Rao", "admin@sungridsolar.in", "sungrid_admin", "Sungrid@123", "Chitradurga, Karnataka", "BESCOM", "9810000101", 5000, "51-200", "active", 120],
     ["VOLTEDGE", "VoltEdge Industries", "Manufacturing plant", "Sara", "Thomas", "admin@voltedge.in", "voltedge_admin", "Voltedge@123", "Hosur, Tamil Nadu", "TANGEDCO", "9810000102", 1200, "51-200", "active", 90],
     ["GREENTECH", "GreenTech Campus", "Education campus", "Rakesh", "Iyer", "admin@greentech.edu", "greentech_admin", "Greentech@123", "Bengaluru, Karnataka", "BESCOM", "9810000103", 800, "11-50", "active", 60],
     ["HX4R7TQM", "Kaveri Textile Mills", "Manufacturing plant", "Lakshmi", "Iyer", "admin@kaveritextile.in", "kaveri_admin", "Kaveri@123", "Tiruppur, Tamil Nadu", "TANGEDCO", "9810000104", 1500, "51-200", "pending", 1],
     ["M8PW3ZKD", "Deccan Data Centre", "Data centre", "Farhan", "Ali", "ops@deccandc.in", "deccan_admin", "Deccan@123", "Hyderabad, Telangana", "TSSPDCL", "9810000105", 3000, "200+", "pending", 0.1],
     ["Q2LN6VEB", "Metro Mall Facilities", "Retail / mall", "Thomas", "George", "facilities@metromall.in", "metromall_admin", "Metro@123", "Kochi, Kerala", "KSEB", "9810000106", 900, "11-50", "suspended", 150]].forEach(function (r) {
      var created = now - r[14] * day;
      data.tenants[r[0]] = seedTenant(r[0], r[1], { industry: r[2], contact: r[5], city: r[8], discom: r[9], phone: r[10], contractDemand: r[11], meters: r[12], status: r[13], created: created, approvedAt: r[13] === "pending" ? null : created + HOUR });
      data.users.push(seedAdmin(r[0], r[3], r[4], r[5], r[6], r[7], created));
    });
    // FEBINO: the energy-app sample team
    // [first, last, empId, email, role, shift, dept, status, minutes since last active, mobile, username, password]
    var team = [
      ["Vijay", "Kumar", "EMP-001", "vijay@febinosolutions.com", "Tenant Admin", "General", "Management", "active", 0, "+91 98450 12345", "vijay", "Admin@123"],
      ["Priya", "Sharma", "EMP-014", "priya.sharma@febinosolutions.com", "Operator", "Shift A", "Production", "active", 12, "+91 99001 23456"],
      ["Arjun", "Nair", "EMP-022", "arjun.nair@febinosolutions.com", "Energy Manager", "General", "Utilities", "active", 60],
      ["Meera", "Iyer", "EMP-031", "meera.iyer@febinosolutions.com", "Supervisor", "Shift B", "Production", "active", 180],
      ["Rahul", "Verma", "EMP-037", "rahul.verma@febinosolutions.com", "Technician", "Shift C", "Maintenance", "active", 1500],
      ["Sneha", "Reddy", "EMP-040", "sneha.reddy@febinosolutions.com", "Viewer", "General", "Finance", "invited", null],
      ["Karthik", "Rao", "EMP-043", "karthik.rao@febinosolutions.com", "Operator", "Shift B", "Production", "active", 120],
      ["Ananya", "Das", "EMP-046", "ananya.das@febinosolutions.com", "Energy Manager", "General", "Sustainability", "active", 300],
      ["Mohammed", "Irfan", "EMP-051", "irfan.m@febinosolutions.com", "Technician", "Shift A", "Maintenance", "active", 30],
      ["Divya", "Menon", "EMP-055", "divya.menon@febinosolutions.com", "Supervisor", "Shift A", "Production", "inactive", 17280],
      ["Suresh", "Babu", "EMP-058", "suresh.babu@febinosolutions.com", "Operator", "Shift C", "Utilities", "active", 360],
      ["Lakshmi", "Pillai", "EMP-062", "lakshmi.p@febinosolutions.com", "Viewer", "General", "Admin", "active", 2880],
      ["Rohit", "Singh", "EMP-066", "rohit.singh@febinosolutions.com", "Operator", "Shift A", "Production", "suspended", 43200],
      ["Neha", "Gupta", "EMP-070", "neha.gupta@febinosolutions.com", "Auditor", "General", "Finance", "invited", null],
      ["Aditya", "Joshi", "EMP-073", "aditya.joshi@febinosolutions.com", "Technician", "Shift B", "Maintenance", "active", 240],
      ["Kavya", "Krishnan", "EMP-077", "kavya.k@febinosolutions.com", "Operator", "Shift C", "Production", "active", 480],
      ["Imran", "Sheikh", "EMP-081", "imran.sheikh@febinosolutions.com", "Supervisor", "Shift C", "Utilities", "active", 1500],
      ["Pooja", "Hegde", "EMP-085", "pooja.hegde@febinosolutions.com", "Viewer", "General", "HR", "active", 4320],
    ];
    var admin = null;
    team.forEach(function (r, i) {
      var u = {
        id: "u" + randomHex(6), org: "FEBINO", first: r[0], last: r[1], empId: r[2], email: r[3],
        username: r[10] || r[3].split("@")[0], role: r[4], shift: r[5], dept: r[6], status: r[7], mobile: r[9] || "",
        designation: i === 0 ? "Energy Manager" : "", created: now - (200 - i * 8) * day,
        lastActive: r[8] === null ? null : now - r[8] * MIN, pw: null, invite: null,
      };
      if (u.status === "invited") u.invite = { token: randomHex(12), by: admin ? admin.id : null, at: now - 2 * day };
      else u.pw = makePassword(r[11] || "Welcome@123");
      if (i === 0) admin = u;
      data.users.push(u);
    });
    return data;
  }

  /* ---------- Helpers ---------- */
  function norm(s) { return String(s || "").trim().toLowerCase(); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function fullName(u) { return (u.first + " " + (u.last || "")).trim(); }
  function initials(name) {
    var parts = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(function (p) { return !/^(pvt|ltd|private|limited|inc|llp|the|and|&)$/i.test(p); });
    return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : (parts[0] || "")[1] || "")).toUpperCase();
  }
  function slugify(s) { return norm(s).replace(/\b(pvt|ltd|private|limited|inc|llp)\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Tenants ---------- */
  function tenant(id) { return db().tenants[String(id || "").toUpperCase()] || null; }
  // 8 random characters without look-alikes (no 0/O, 1/I), unique in this store — e.g. K7M4QX2P
  var ORG_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function generateOrgId() {
    for (var tries = 0; tries < 500; tries++) {
      var bytes = randomHex(8), id = "";
      for (var i = 0; i < 8; i++) id += ORG_ID_CHARS.charAt(parseInt(bytes.substr(i * 2, 2), 16) % ORG_ID_CHARS.length);
      if (!db().tenants[id]) return id;
    }
    throw new Error("Could not generate a unique Organisation ID");
  }
  function tenants() {
    var t = db().tenants, list = [];
    for (var k in t) list.push(t[k]);
    return list.sort(function (a, b) { return b.created - a.created; });
  }
  // Platform admin: approve (pending → active), suspend, reactivate
  function setTenantStatus(id, status) {
    var t = tenant(id);
    if (!t) return null;
    t.status = status;
    if (status === "active" && !t.approvedAt) t.approvedAt = Date.now();
    save();
    return t;
  }
  function slugTaken(slug) {
    var t = db().tenants;
    for (var k in t) if (t[k].slug === slug) return true;
    return false;
  }
  function createTenant(data) {
    var id = data.id || generateOrgId();
    var t = {
      id: id, name: data.name.trim(), slug: data.slug || slugify(data.name), industry: data.industry || "", gstin: data.gstin || "",
      sites: data.sites || "1", country: data.country || "", timezone: data.timezone || "", address: data.address || "",
      plan: data.plan || "starter", cycle: data.cycle || "Monthly", contact: data.contact || "", phone: data.phone || "",
      // Energy site details captured at registration
      city: data.city || "", discom: data.discom || "", contractDemand: data.contractDemand || 0, meters: data.meters || "",
      status: "pending", // every new sign-up waits for the platform admin
      created: Date.now(), approvedAt: null,
    };
    db().tenants[id] = t;
    save();
    return t;
  }
  function updateTenant(id, patch) {
    var t = tenant(id);
    if (!t) return null;
    for (var k in patch) if (k !== "id") t[k] = patch[k];
    save();
    return t;
  }
  function deleteTenant(id) {
    var d = db();
    delete d.tenants[id];
    d.users = d.users.filter(function (u) { return u.org !== id; });
    save();
  }
  // Every tenant an email address belongs to (for "Find my Org ID" and "Switch organisation")
  // (includes pending/suspended tenants — callers filter on tenant.status where it matters)
  function membershipsFor(email) {
    var e = norm(email);
    return db().users.filter(function (u) { return norm(u.email) === e && tenant(u.org); })
      .map(function (u) { return { user: u, tenant: tenant(u.org) }; });
  }

  /* ---------- Users ---------- */
  function users(org) { return db().users.filter(function (u) { return u.org === org; }); }
  function user(id) {
    var list = db().users;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // Login by email or username within one tenant
  function findLogin(org, login) {
    var l = norm(login);
    var list = users(String(org || "").toUpperCase());
    for (var i = 0; i < list.length; i++) if (norm(list[i].email) === l || norm(list[i].username) === l) return list[i];
    return null;
  }
  // One-time code sign-in: registered email or mobile
  function findContact(org, contact) {
    var c = norm(contact), d = digits(contact);
    var list = users(String(org || "").toUpperCase());
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if (norm(u.email) === c) return u;
      if (d.length >= 10 && digits(u.mobile).slice(-10) === d.slice(-10)) return u;
    }
    return null;
  }
  // Registration: usernames are unique across the whole platform
  function usernameTaken(username) {
    var n = norm(username);
    return db().users.some(function (u) { return norm(u.username) === n; }) || (db().platformAdmin && norm(db().platformAdmin.username) === n);
  }
  function emailTaken(org, email, exceptId) {
    var e = norm(email);
    return users(org).some(function (u) { return u.id !== exceptId && norm(u.email) === e; });
  }
  function nextEmpId(org) {
    var max = 0;
    users(org).forEach(function (u) { var n = parseInt(digits(u.empId), 10); if (n > max) max = n; });
    return "EMP-" + ("00" + (max + 1)).slice(-3);
  }
  function createUser(org, data, opts) {
    opts = opts || {};
    var u = {
      id: "u" + randomHex(6), org: org, first: data.first.trim(), last: (data.last || "").trim(), email: data.email.trim(),
      username: (data.username || data.email.split("@")[0]).trim(), mobile: data.mobile || "", empId: data.empId || nextEmpId(org),
      role: data.role || "Viewer", shift: data.shift || "General", dept: data.dept || "", designation: data.designation || "",
      status: opts.password || opts.pwRecord ? "active" : "invited", created: Date.now(), lastActive: null, pw: null, invite: null,
      sites: data.sites || [], twoFactor: !!data.twoFactor,
    };
    if (opts.pwRecord) { u.pw = opts.pwRecord; u.status = "active"; }
    else if (opts.password) u.pw = makePassword(opts.password);
    else u.invite = { token: randomHex(12), by: opts.invitedBy || null, at: Date.now() };
    db().users.push(u);
    save();
    return u;
  }
  function updateUser(id, patch) {
    var u = user(id);
    if (!u) return null;
    for (var k in patch) if (k !== "id" && k !== "org" && k !== "pw") u[k] = patch[k];
    save();
    return u;
  }
  function deleteUser(id) {
    var d = db();
    d.users = d.users.filter(function (u) { return u.id !== id; });
    save();
  }
  function setPassword(u, pw) {
    u.pw = makePassword(pw);
    save();
  }
  function checkPassword(u, pw) {
    return !!(u && u.pw && hashPassword(pw, u.pw.salt) === u.pw.hash);
  }
  function findInvite(token) {
    if (!token) return null;
    var list = db().users;
    for (var i = 0; i < list.length; i++) if (list[i].invite && list[i].invite.token === token && list[i].status === "invited") return list[i];
    return null;
  }
  function acceptInvite(u, data) {
    u.first = data.first || u.first;
    u.last = data.last != null ? data.last : u.last;
    u.mobile = data.mobile || u.mobile;
    u.status = "active";
    u.invite = null;
    setPassword(u, data.password);
    return u;
  }
  function inviteLink(u) {
    var base = location.href.replace(/[^/]*$/, "");
    return base + "accept-invite.html?token=" + (u.invite ? u.invite.token : "");
  }

  /* ---------- Session ---------- */
  function readSession() {
    var s = null;
    try { s = readJSON(sessionStorage, SESSION_KEY) || readJSON(localStorage, SESSION_KEY); } catch (e) { s = null; }
    return s;
  }
  function signIn(u, remember) {
    signOut();
    var s = { uid: u.id, org: u.org, exp: Date.now() + (remember ? 30 * 24 : 12) * HOUR };
    writeJSON(remember ? localStorage : sessionStorage, SESSION_KEY, s);
    u.lastActive = Date.now();
    save();
    rememberOrg(u.org);
  }
  function signOut() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
  }
  // { status: "ok" | "none" | "expired" | "revoked", user, tenant }
  function session() {
    var s = readSession();
    if (!s) return { status: "none" };
    if (!s.exp || s.exp < Date.now()) { signOut(); return { status: "expired" }; }
    var u = user(s.uid), t = u && tenant(u.org);
    if (!u || !t || u.status !== "active" || t.status !== "active") { signOut(); return { status: "revoked" }; }
    return { status: "ok", user: u, tenant: t };
  }

  /* ---------- Platform admin (Control Center) — separate, tab-only session ---------- */
  var ADMIN_KEY = "ed-admin-session";
  function adminSignIn(username, pw) {
    var a = db().platformAdmin;
    if (!a || norm(username) !== norm(a.username) || hashPassword(pw, a.pw.salt) !== a.pw.hash) return false;
    writeJSON(sessionStorage, ADMIN_KEY, { exp: Date.now() + 8 * HOUR });
    return true;
  }
  function adminSession() {
    var s = readJSON(sessionStorage, ADMIN_KEY);
    if (!s || s.exp < Date.now()) { adminSignOut(); return null; }
    return db().platformAdmin;
  }
  function adminSignOut() {
    try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* storage blocked */ }
  }
  function switchTenant(org) {
    var s = session();
    if (s.status !== "ok") return null;
    var target = null;
    membershipsFor(s.user.email).forEach(function (m) { if (m.tenant.id === org && m.user.status === "active" && m.tenant.status === "active") target = m.user; });
    if (!target) return null;
    var remembered = !!readJSON(localStorage, SESSION_KEY);
    signIn(target, remembered);
    return target;
  }

  /* ---------- One-time codes (email verification, OTP sign-in, password reset) ---------- */
  function startPending(kind, data) {
    data.code = randomDigits(6);
    data.exp = Date.now() + 10 * MIN;
    data.tries = 0;
    writeJSON(sessionStorage, PENDING_KEY + kind, data);
    return data;
  }
  function pending(kind) {
    var p = readJSON(sessionStorage, PENDING_KEY + kind);
    return p && p.exp > Date.now() ? p : null;
  }
  function resendPending(kind) {
    var p = readJSON(sessionStorage, PENDING_KEY + kind);
    return p ? startPending(kind, p) : null;
  }
  // "ok" | "wrong" | "expired" | "locked"
  function checkCode(kind, code) {
    var p = readJSON(sessionStorage, PENDING_KEY + kind);
    if (!p || p.exp < Date.now()) return "expired";
    if (p.tries >= 5) return "locked";
    if (String(code) === p.code) return "ok";
    p.tries++;
    writeJSON(sessionStorage, PENDING_KEY + kind, p);
    return p.tries >= 5 ? "locked" : "wrong";
  }
  function clearPending(kind) {
    try { sessionStorage.removeItem(PENDING_KEY + kind); } catch (e) { /* storage blocked */ }
  }

  /* ---------- Organisation IDs used on this device (login suggestions) ---------- */
  function recentOrgs() { return readJSON(localStorage, "ed-recent-orgs") || []; }
  function rememberOrg(id) {
    var list = recentOrgs().filter(function (x) { return x !== id; });
    list.unshift(id);
    writeJSON(localStorage, "ed-recent-orgs", list.slice(0, 5));
  }

  function timeAgo(ts) {
    if (!ts) return "—";
    var m = Math.round((Date.now() - ts) / MIN);
    if (m < 2) return "Just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " h ago";
    var d = Math.round(h / 24);
    if (d === 1) return "Yesterday";
    if (d < 30) return d + " days ago";
    var mo = Math.round(d / 30);
    return mo === 1 ? "1 month ago" : mo + " months ago";
  }
  function maskEmail(e) {
    var p = String(e || "").split("@");
    return p.length === 2 ? p[0].slice(0, 2) + "•••@" + p[1] : e;
  }
  function maskPhone(m) {
    var d = digits(m);
    return d.length >= 10 ? "+" + d.slice(0, d.length - 10) + " " + d.slice(-10, -8) + "••• ••" + d.slice(-3) : m;
  }

  window.EDStore = {
    ROLES: ROLES, DEPARTMENTS: DEPARTMENTS, SHIFTS: SHIFTS, PLANS: PLANS,
    tenant: tenant, tenants: tenants, generateOrgId: generateOrgId, createTenant: createTenant, updateTenant: updateTenant, deleteTenant: deleteTenant,
    setTenantStatus: setTenantStatus, adminSignIn: adminSignIn, adminSession: adminSession, adminSignOut: adminSignOut,
    slugTaken: slugTaken, slugify: slugify, membershipsFor: membershipsFor,
    users: users, user: user, findLogin: findLogin, findContact: findContact, emailTaken: emailTaken, usernameTaken: usernameTaken, nextEmpId: nextEmpId,
    createUser: createUser, updateUser: updateUser, deleteUser: deleteUser, setPassword: setPassword, checkPassword: checkPassword,
    hashNewPassword: makePassword,
    findInvite: findInvite, acceptInvite: acceptInvite, inviteLink: inviteLink,
    signIn: signIn, signOut: signOut, session: session, switchTenant: switchTenant,
    startPending: startPending, pending: pending, resendPending: resendPending, checkCode: checkCode, clearPending: clearPending,
    recentOrgs: recentOrgs, fullName: fullName, initials: initials, timeAgo: timeAgo, maskEmail: maskEmail, maskPhone: maskPhone,
    clone: clone, _sha256: sha256,
  };
})();
