/* Admin page controller: login gate + editor visibility.

   The gate reads data/admin.json (see scripts/set-admin-password.js). If that
   file is missing the login screen explains how to set it up. Session persists
   for up to 8 hours in sessionStorage. */

window.Numis = window.Numis || {};

(function () {
  function show(sel, visible) {
    var el = document.querySelector(sel);
    if (el) el.hidden = !visible;
  }

  function enter() {
    show("#admin-login", false);
    show("#admin-editor", true);
    document.title = "Catalog editor | NumisTrade Admin";
  }

  function renderLoginHint(err) {
    var hint = document.getElementById("login-hint");
    var errorEl = document.getElementById("login-error");
    if (err && err.code === "NOT_CONFIGURED") {
      if (hint) hint.innerHTML =
        "Admin not set up yet. Run <code>node scripts/set-admin-password.js &lt;user&gt; &lt;password&gt;</code> " +
        "locally, then push <code>data/admin.json</code> to the repo (or keep it out of the repo and " +
        "re-generate it — it is only an access gate, not real security).";
    }
    if (hint) hint.hidden = false;
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }
  }

  function showLoginError(message) {
    var errorEl = document.getElementById("login-error");
    var hint = document.getElementById("login-hint");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (hint) hint.hidden = true;
  }

  function lockMessage(remainingMs) {
    return "Too many attempts. Try again in " + Math.ceil(remainingMs / 1000) + "s.";
  }

  function bindLogin() {
    var form = document.getElementById("login-form");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var user = form.elements.username.value;
      var pass = form.elements.password.value;
      var btn = document.getElementById("login-btn");
      if (btn) btn.disabled = true;
      Numis.adminAuth
        .login(user, pass)
        .then(enter)
        .catch(function (err) {
          if (btn) btn.disabled = false;
          if (err && err.code === "LOCKED") showLoginError(lockMessage(Numis.adminAuth.lockRemaining()));
          else if (err && err.code === "NOT_CONFIGURED") renderLoginHint(err);
          else showLoginError("Incorrect username or password.");
          form.elements.password.focus();
        });
    });
  }

  function bindLogout() {
    var btn = document.querySelector("[data-logout]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      Numis.adminAuth.logout();
      window.location.reload();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (Numis.adminAuth.hasSession()) {
      enter();
    } else {
      renderLoginHint();
      bindLogin();
    }
    bindLogout();
  });
})();