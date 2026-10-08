/* ==========================================================================
   Energy Dashboard — device tokens (Device Management → Add / Edit device)
   Each device signs in to the platform with its own secret token:
     MQTT   → username = Client ID (ORG.GW-07), password = token
     HTTPS  → Authorization: Bearer <token>
   A token is generated when the device is created and shown only once: the
   server keeps a hash, so it can't be shown again — only replaced
   (Edit device → Regenerate token), which disconnects the device until the new
   token is entered in it.
   Demo mode: tokens are made in the browser (crypto.getRandomValues) and not saved.
   ========================================================================== */
(function () {
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  // "edt_" + 40 random base62 characters (≈ 238 bits)
  function newToken() {
    var out = "edt_", bytes = new Uint8Array(40);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % 62]; // 256 % 62 bias is negligible for a 40-char secret
    return out;
  }
  function org() {
    var s = window.EDStore && EDStore.session();
    return s && s.status === "ok" ? s.tenant.id : "ORG";
  }
  function $(sel, root) { return (root || document).querySelector(sel); }

  /* ---------- Add device: token made with the form, must be copied before creating ---------- */
  function setupNew(box) {
    var modal = box.closest(".modal"), val = $("[data-token-value]", box), client = $("[data-token-client]", box);
    var ack = $("[data-token-ack]", box), warn = $("[data-token-warn]", box), idInput = $("[data-device-id]", modal);
    var submit = $("[data-token-submit]", modal);
    function fresh() { val.value = newToken(); ack.checked = false; warn.hidden = true; }
    function syncClient() { client.value = org() + "." + ((idInput && idInput.value.trim()) || "GW-??").toUpperCase(); }
    fresh(); syncClient();
    if (idInput) idInput.addEventListener("input", syncClient);
    $("[data-token-regen]", box).addEventListener("click", fresh);
    // A new token every time the dialog is opened, so a token is never reused for two devices
    window.addEventListener("hashchange", function () { if (location.hash === "#" + modal.id) { fresh(); syncClient(); } });
    ack.addEventListener("change", function () { if (ack.checked) warn.hidden = true; });
    submit.addEventListener("click", function (e) {
      if (submit.classList.contains("is-disabled") || ack.checked) return;
      e.preventDefault(); e.stopPropagation();
      warn.hidden = false;
      ack.focus();
    }, true);
  }

  /* ---------- Edit device: masked token, regenerate on request ---------- */
  function setupEdit(box) {
    var masked = $("[data-token-masked]", box), shown = $("[data-token-shown]", box), val = $("[data-token-value]", box);
    var confirmRow = $("[data-token-confirm]", box);
    $("[data-token-regen]", box).addEventListener("click", function () { confirmRow.hidden = false; });
    $("[data-token-cancel]", box).addEventListener("click", function () { confirmRow.hidden = true; });
    $("[data-token-do]", box).addEventListener("click", function () {
      var t = newToken();
      val.value = t;
      masked.textContent = "edt_••••••••••••" + t.slice(-4) + " · created just now";
      confirmRow.hidden = true;
      shown.hidden = false;
    });
    // closing the dialog hides the new token again — it is shown once
    window.addEventListener("hashchange", function () { if (location.hash !== "#" + box.closest(".modal").id) { shown.hidden = true; val.value = ""; } });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-token-new]"), setupNew);
    Array.prototype.forEach.call(document.querySelectorAll("[data-token-edit]"), setupEdit);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
