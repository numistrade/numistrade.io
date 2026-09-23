/* Shared UI helpers: escaping, formatting, toast messages. */

window.Numis = window.Numis || {};

(function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatINR(amount) {
    var value = Number(amount);
    if (!isFinite(value)) value = 0;
    return "₹" + value.toLocaleString("en-IN");
  }

  function formatYear(year) {
    if (year === null || year === undefined || year === "") return "Not dated";
    return String(year);
  }

  var toastTimer = null;

  function showToast(message) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2600);
  }

  Numis.ui = {
    escapeHtml: escapeHtml,
    formatINR: formatINR,
    formatYear: formatYear,
    showToast: showToast
  };
})();
