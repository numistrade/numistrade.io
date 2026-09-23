const express = require("express");
const { config } = require("../config");
const { getDb } = require("../db");
const { productRowToApi, orderRowToApi } = require("../mappers");
const { HttpError, asyncRoute, validateOrderPayload, requireString, normalizePhone, patterns } = require("../validate");

const router = express.Router();

function nowIso() {
  return new Date().toISOString();
}

function generateOrderId(db) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `NT-${year}${Math.floor(100000 + Math.random() * 900000)}`;
    const exists = db.prepare("SELECT 1 FROM orders WHERE order_id = ?").get(candidate);
    if (!exists) return candidate;
  }
  throw new HttpError(500, "Could not generate an order id.");
}

// GET /api/products — all active products (filtering/sorting happens client-side)
router.get("/products", (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM products WHERE active = 1 ORDER BY rowid ASC")
    .all();
  res.json({ products: rows.map(productRowToApi), total: rows.length });
});

// GET /api/products/:id
router.get("/products/:id", (req, res) => {
  const row = getDb()
    .prepare("SELECT * FROM products WHERE id = ? AND active = 1")
    .get(req.params.id);
  if (!row) throw new HttpError(404, "Product not found.");
  res.json({ product: productRowToApi(row) });
});

// POST /api/orders — create an order; prices/totals/inventory are computed server-side
router.post("/orders", (req, res) => {
  const payload = validateOrderPayload(req.body);
  const db = getDb();

  const orderId = db.transaction(() => {
    let subtotal = 0;
    const items = [];

    for (const line of payload.items) {
      const product = db
        .prepare("SELECT id, name, price, stock, active FROM products WHERE id = ?")
        .get(line.productId);
      if (!product) throw new HttpError(400, `Product not found: ${line.productId}`);
      if (!product.active) throw new HttpError(400, `Product unavailable: ${product.name}`);
      if (product.stock < line.qty) {
        throw new HttpError(
          409,
          product.stock === 0
            ? `Out of stock: ${product.name}`
            : `Only ${product.stock} left of ${product.name}.`
        );
      }

      db.prepare(
        "UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?"
      ).run(line.qty, nowIso(), product.id);

      const lineTotal = product.price * line.qty;
      subtotal += lineTotal;
      items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: line.qty,
        lineTotal,
      });
    }

    const shippingFee = subtotal >= config.freeShippingOver ? 0 : config.shippingFee;
    const total = subtotal + shippingFee;
    const id = generateOrderId(db);
    const timestamp = nowIso();

    db.prepare(
      `INSERT INTO orders (
        order_id, customer_name, customer_phone, customer_email,
        address, city, state, postal_code, country,
        items, subtotal, shipping_fee, total,
        payment_method, payment_status, payment_reference,
        fulfilment_status, tracking_number, carrier,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPI', 'pending', '', 'pending', '', '', ?, ?)`
    ).run(
      id,
      payload.customer.name,
      payload.customer.phone,
      payload.customer.email,
      payload.shipping.address,
      payload.shipping.city,
      payload.shipping.state,
      payload.shipping.postalCode,
      payload.shipping.country,
      JSON.stringify(items),
      subtotal,
      shippingFee,
      total,
      timestamp,
      timestamp
    );

    return id;
  })();

  const row = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
  res.status(201).json({ order: orderRowToApi(row) });
});

// GET /api/orders/:orderId?phone=… — customer order lookup (requires matching phone)
router.get("/orders/:orderId", (req, res) => {
  const rawPhone = String(req.query.phone || "").replace(/[\s\-()]/g, "");
  if (!rawPhone) throw new HttpError(400, "Phone number is required to look up an order.");

  const row = getDb()
    .prepare("SELECT * FROM orders WHERE order_id = ?")
    .get(req.params.orderId);
  if (!row) throw new HttpError(404, "Order not found.");

  const provided = patterns.phoneIndia.test(rawPhone) ? rawPhone.slice(-10) : rawPhone;
  if (row.customer_phone !== provided) throw new HttpError(404, "Order not found.");

  res.json({ order: orderRowToApi(row) });
});

// POST /api/orders/:orderId/reference — customer submits UPI reference (UTR)
// Status stays unverified until an admin confirms the payment.
router.post(
  "/orders/:orderId/reference",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const phone = String(body.phone || "").replace(/[\s\-()]/g, "");
    const reference = requireString(body.reference, {
      field: "reference",
      min: 4,
      max: 100,
    });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM orders WHERE order_id = ?")
      .get(req.params.orderId);
    if (!row) throw new HttpError(404, "Order not found.");

    const provided = patterns.phoneIndia.test(phone) ? phone.slice(-10) : phone;
    if (row.customer_phone !== provided) throw new HttpError(404, "Order not found.");

    if (["verified", "rejected", "refunded"].includes(row.payment_status)) {
      throw new HttpError(400, `Payment already marked as ${row.payment_status}.`);
    }

    db.prepare(
      `UPDATE orders SET payment_reference = ?, payment_status = 'submitted', updated_at = ? WHERE order_id = ?`
    ).run(reference, nowIso(), row.order_id);

    const updated = db
      .prepare("SELECT * FROM orders WHERE order_id = ?")
      .get(row.order_id);
    res.json({ order: orderRowToApi(updated) });
  })
);

module.exports = router;
