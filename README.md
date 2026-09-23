# NumisTrade

Online marketplace for collectible and numismatic coins.

**Coins • History • Collection**

Phase 1 — frontend architecture (static prototype). No backend yet.

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
│   ├── products.js       loads data/products.json, renders catalog + detail
│   ├── cart.js           cart state (localStorage – UI only)
│   ├── checkout.js       validation, order object, confirmation page
│   └── app.js            mobile menu, cart badge, footer year
└── data/
    └── products.json     sample product catalog (all items marked `demo: true`)
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

## Run locally

The site fetches `data/products.json`, which requires serving over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

Opening `index.html` directly with `file://` will not load the catalog
(the browser blocks the JSON fetch); use a local server instead.

## GitHub Pages

All paths are relative, so the site works at a project-site URL such as
`https://numistrade.github.io/numistrade.io/`.

## Status

- **Implemented:** landing, catalog, detail, cart, checkout, confirmation —
  frontend prototype only.
- **BACKEND REQUIRED:** order creation/storage, UPI ID + QR, payment
  verification, inventory control, admin, tracking/notifications.
- Cart uses `localStorage` and the last order is kept in `sessionStorage` for
  the confirmation page only. This is temporary UI state — not an order database.