/* NumisTrade backend API base URL (Phase 2).

   "" (empty) = same origin as this site. On GitHub Pages there is no backend
   here, so the site automatically falls back to "demo mode":
   static data/products.json + a local-only order confirmation.

   When the backend is deployed, set this to its base URL without a trailing
   slash, e.g.  "https://numistrade-api.onrender.com"

   No secrets belong in this file — admin credentials live in the backend's
   environment (.env), never in the browser. */

window.Numis = window.Numis || {};
Numis.apiBase = "";