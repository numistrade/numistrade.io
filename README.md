# NumisTrade

Online marketplace for collectible and numismatic coins.

**Coins • History • Collection**

Phase 1 — frontend architecture (static prototype).
Phase 2 — backend API (Node/Express + SQLite) with orders, inventory and
admin authentication; the frontend now uses the API when reachable and falls
back to demo mode otherwise.

## Pages

| Page | Purpose |
|------|---------|
| `index.html` | Landing page: hero, categories, featured coins, how it works |
| `products.html` | Catalog listing with category filter, search, sort, stock filter |
| `product.html?id=…` | Coin detail page with quantity selector, add to cart / buy now |
| `cart.html` | Cart with quantity controls and order summary |
| `checkout.html` | Customer + delivery form, order summary, validation |
| `order-success.html` | Order confirmation + UPI payment instructions (read-only placeholder) |

## Structure

```
├── index.html
├── products.html
├── product.html
├── cart.html
├── checkout.html
├── order-success.html
├── css/
│   ├── base.css          tokens, reset, layout, header, footer
│   ├── components.css    buttons, cards, forms, cart, checkout, states
│   └── responsive.css    mobile / tablet / desktop breakpoints
├── js/
│   ├── ui.js             escaping, INR formatting, toast
│   ├── config.js         API base URL ("" = same-origin/demo mode)
│   ├── api.js            HTTP client for the backend (fails soft)
│   ├── products.js       catalog: API first, falls back to data/products.json
│   ├── cart.js           cart state (localStorage – UI only)
│   ├── checkout.js       validation, order creation (API or demo), reference
│   └── app.js            mobile menu, cart badge, footer year
├── data/
│   └── products.json     sample product catalog (all items marked `demo: true`)
└── backend/
    ├── src/              Express app, SQLite schema, auth, seed, routes
    ├── test/             integration tests (node --test)
    └── data/             SQLite database lives here (gitignored)
```

## Product data

Edit `data/products.json`: each product uses the schema

```json
{
  "id": "coin-001",
  "name": "Example Indian Coin",
  "slug": "example-indian-coin",
  "category": "Republic India",
  "year": 1975,
  "country": "India",
  "denomination": "1 Rupee",
  "condition": "Very Fine",
  "price": 500,
  "currency": "INR",
  "stock": 3,
  "images": [],
  "description": "…",
  "featured": true,
  "active": true
}
```

The included products are clearly marked `"demo": true` sample listings. Replace
them with real inventory (and set `demo: false` or remove the field) before launch.

## Backend API (Phase 2)

Node.js 18+/20 with Express and SQLite (better-sqlite3). Password hashing via
bcrypt, admin sessions via JWT, order prices/inventory computed server-side.

### Setup and run

```bash
cd backend
npm install
cp .env.example .env      # then set JWT_SECRET to a long random string
npm run seed              # loads products from data/products.json, creates admin
npm run dev               # or npm start — serves the API on http://localhost:4000
```

Environment variables (`.env`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | API port |
| `DB_PATH` | `./data/numistrade.sqlite` | SQLite file |
| `JWT_SECRET` | — (required) | signs admin JWTs; server refuses to start without it |
| `JWT_EXPIRES` | `12h` | admin token lifetime |
| `CORS_ORIGIN` | `*` | comma-separated allowed origins for the browser client |
| `SHIPPING_FEE` | `50` | flat delivery charge (INR) |
| `FREE_SHIPPING_OVER` | `2000` | free delivery above this subtotal |
| `ADMIN_USERNAME` | `admin` | admin login |
| `ADMIN_PASSWORD` | generated | if set, creates that password; otherwise a random one is printed once at seed time |

`npm run seed` refreshes catalog details from `data/products.json` but preserves
existing DB stock — the database is authoritative for inventory. An admin user is
created only if none exists.

### Endpoints

Public:

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | liveness probe |
| GET | `/api/products` | `?category=&q=&sort=price_asc\|price_desc\|newest&inStock=&featured=` |
| GET | `/api/products/:id` | single product |
| POST | `/api/orders` | create order — client sends only items `[{productId, qty}]` + customer + shipping; server computes prices, totals, id (`NT-…`), decrements stock in a transaction |
| GET | `/api/orders/:orderId?phone=…` | customer order lookup (+10-digit phone) |
| POST | `/api/orders/:orderId/reference` | record a UPI reference (sets `submitted`, never `verified`) |

Admin (all require `Authorization: Bearer <token>`): See `backend/src/routes/admin.js`.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/admin/auth/login` | `{username, password}` → `{token}` |
| GET | `/api/admin/orders` | filter `payment`, `fulfilment`, `q`; paginate `limit`/`offset` |
| GET | `/api/admin/orders/:orderId` | full order with items |
| PATCH | `/api/admin/orders/:orderId` | update `paymentStatus`, `paymentReference`, `fulfilmentStatus`, `carrier`, `trackingNumber` |
| POST | `/api/admin/orders/:orderId/cancel` | cancels an order, restores stock |
| GET | `/api/admin/products` | all products incl. inactive |
| PATCH | `/api/admin/products/:id` | update price/stock/active etc. |

### Tests

```bash
cd backend
npm test        # 14 integration tests (in-memory DB, random ports)
```

### Admin UI

An admin interface is planned (Phase 3). Until then, talk to the API directly,
e.g. with curl:

```bash
curl -s -X POST http://localhost:4000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'
```

## Frontend ←→ backend wiring

`js/config.js` sets the API base URL. Empty (`""`) means *same origin → demo
mode*: the site uses `data/products.json` and stores a demo order in this
browser tab only. When a backend is deployed, set it to its base URL, e.g.
`https://numistrade-api.onrender.com`, and the site automatically:

- lists products from the API, falling back to the static file on failure;
- creates orders against the API (server decides prices/stock/totals);
- records payment references on the server (with local fallback on network error).

No secrets live in the frontend; admin credentials belong to the backend `.env`.

## Run locally

Serve the static site over HTTP (needed for `data/products.json`):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Opening `index.html` directly with
`file://` will not load the catalog (the browser blocks the JSON fetch); use a
local server instead.

To test the full API flow, run the backend (above), set `Numis.apiBase` in
`js/config.js` to `http://localhost:4000`, and reload the site.

## GitHub Pages

All paths are relative, so the site works on GitHub Pages. The backend cannot be
hosted there — deploy it to a PaaS (Render/Railway/Fly) / VPS and set
`js/config.js` accordingly; configure `CORS_ORIGIN` to your Pages origin.

## Status

- **Implemented:** landing, catalog, detail, cart, checkout, confirmation;
  full backend (products, orders, inventory, admin auth, payment/fulfilment
  lifecycle) with 14 passing integration tests.
- **Planned (next phases):** admin UI dashboard (3), live UPI/QR + payment
  verification (4), fulfillment/notifications (5).
- Cart uses `localStorage` and the last order is kept in `sessionStorage` for
  the confirmation page only. This is temporary UI state — not an order database;
  the backend is authoritative once connected.