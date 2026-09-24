/* Admin login gate for the static admin page.

   Reads data/admin.json (PBKDF2-SHA256 hash) and verifies the typed password
   using WebCrypto. On success a session token is kept in sessionStorage.

   SECURITY LIMITATION: this all runs in the browser, so it is a *gate*, not
   real authentication — a determined visitor can read the hash file and patch
   the JS. Genuinely secure admin auth requires a server (not possible on a
   static host). This gate only stops casual visitors. Rate-limited with a
   short lockout. */

window.Numis = window.Numis || {};

(function () {
  var SESSION_KEY = "numis_admin_session";
  var ATTEMPTS_KEY = "numis_admin_attempts";
  var MAX_ATTEMPTS = 5;
  var LOCKOUT_MS = 30 * 1000;
  var SESSION_TTL_MS = 8 * 60 * 60 * 1000;

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  function pbkdf2Hash(password, saltBytes, iterations) {
    var enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    var pwd = enc.encode(password);
    return crypto.subtle
      .importKey("raw", pwd, "PBKDF2", false, ["deriveBits"])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-256" },
          key,
          256
        );
      })
      .then(function (bits) {
        return new Uint8Array(bits);
      });
  }

  function lockRemaining() {
    var raw = sessionStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return 0;
    var d = JSON.parse(raw);
    if (d.count >= MAX_ATTEMPTS) {
      var wait = LOCKOUT_MS - (Date.now() - d.startedAt);
      if (wait > 0) return wait;
      sessionStorage.removeItem(ATTEMPTS_KEY);
    }
    return 0;
  }

  function recordFailure() {
    var raw = sessionStorage.getItem(ATTEMPTS_KEY);
    var d = raw ? JSON.parse(raw) : { count: 0 };
    if (d.count === 0 || d.count >= MAX_ATTEMPTS) d.startedAt = Date.now();
    d.count++;
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(d));
  }

  function clearAttempts() {
    sessionStorage.removeItem(ATTEMPTS_KEY);
  }

  function hasSession() {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    return d && Date.now() - d.at < SESSION_TTL_MS;
  }

  function startSession() {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ at: Date.now() })
    );
    clearAttempts();
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ATTEMPTS_KEY);
  }

  function AuthError(message) {
    var e = new Error(message);
    e.code = message;
    return e;
  }

  function fetchConfig() {
    return fetch("data/admin.json", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw AuthError("NOT_CONFIGURED");
      return res.json();
    });
  }

  /* Returns a Promise<true> on success, else throws AuthError. */
  function login(username, password) {
    var wait = lockRemaining();
    if (wait > 0) throw AuthError("LOCKED");

    return fetchConfig()
      .then(function (config) {
        if (String(username).trim() !== String(config.user)) throw AuthError("BAD_CREDENTIALS");
        var salt = hexToBytes(config.salt);
        return pbkdf2Hash(password, salt, config.iterations).then(function (derived) {
          var expected = hexToBytes(config.hash);
          if (!constantTimeEqual(derived, expected)) throw AuthError("BAD_CREDENTIALS");
          startSession();
          return true;
        });
      })
      .catch(function (err) {
        if (err && (err.code === "LOWERCASE" || err.code === "BAD_CREDENTIALS")) {
          recordFailure();
        }
        throw err;
      });
  }

  Numis.adminAuth = {
    login: login,
    hasSession: hasSession,
    logout: logout,
    lockRemaining: lockRemaining,
    fetchConfig: fetchConfig
  };
})();