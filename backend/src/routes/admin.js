const express = require("express");
const { getDb } = require("../db");
const { authenticateAdmin, verifyPassword, signToken } = require("../auth");
const { HttpError, asyncRoute, requireString, patterns } = require("../validate");
const { productRowToApi, orderRowToApi } = require("../mappers");

const router = express.Router();

function nowIso() {
  return new Date().toISOString();
}

// POST /api/admin/auth/login — real password check (bcrypt), returns a JWT
router.post(
  "/auth/login",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      throw new HttpError(400, "Username and password are required.");
    }

    const user = getDb()
      .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
      .get(username);
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, "invalid-hash");
    if (!user || !valid || !user.is_active) {
      throw new HttpError(401, "Invalid username or password.");
    }

    res.json({
      token: signToken(user),
      admin: { username: user.username, name: user.name },
    });
  })
);

// Everything below requires a valid admin token
router.use(authenticateAdmin);

// GET /api/admin/orders?q=&payment=&fulfilment=&limit=&offset=
router.get("/orders", (req, res) => {
  const conditions = [];
  const params = [];

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    conditions.push(
      "(order_id LIKE ? OR lower(customer_name) LIKE ? OR customer_phone LIKE ?)"
    );
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, `%${q}%`);
  }

  const payment = typeof req.query.payment === "string" ? req.query.payment : "";
  if (payment) {
    if (!patterns.paymentStatus.includes(payment)) {
      throw new HttpError(400, "Invalid payment status filter.");
    }
    conditions.push("payment_status = ?");
    params.push(payment);
  }

  const fulfilment = typeof req.query.fulfilment === "string" ? req.query.fulfilment : "";
  if (fulfilment) {
    const allowed = [...patterns.fulfilmentStatus, "cancelled"];
    if (!allowed.includes(fulfilment)) {
      throw new HttpError(400, "Invalid fulfilment status filter.");
    }
    conditions.push("fulfilment_status = ?");
    params.push(fulfilment);
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) AS count FROM orders ${where}`).get(...params).count;
  const rows = db
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ orders: rows.map(orderRowToApi), total, limit, offset });
});

// GET /api/admin/orders/:orderId
router.get("/orders/:orderId", (req, res) => {
  const row = getDb()
    .prepare("SELECT * FROM orders WHERE order_id = ?")
    .get(req.params.orderId);
  if (!row) throw new HttpError(404, "Order not found.");
  res.json({ order: orderRowToApi(row) });
});

// PATCH /api/admin/orders/:orderId — payment verification, fulfilment, tracking
router.patch("/orders/:orderId", (req, res) => {
  const body = req.body || {};
  const updates = [];
  const params = [];

  if (body.paymentStatus !== undefined) {
    if (!patterns.paymentStatus.includes(body.paymentStatus)) {
      throw new HttpError(400, "Invalid payment status.");
    }
    updates.push("payment_status = ?");
    params.push(body.paymentStatus);
  }

  if (body.paymentReference !== undefined) {
    updates.push("payment_reference = ?");
    params.push(String(body.paymentReference).trim().slice(0, 100));
  }

  if (body.fulfilmentStatus !== undefined) {
    if (!patterns.fulfilmentStatus.includes(body.fulfilmentStatus)) {
      throw new HttpError(
        400,
        "Invalid fulfilment status. Use POST /cancel to cancel an order."
      );
    }
    updates.push("fulfilment_status = ?");
    params.push(body.fulfilmentStatus);
  }

  if (body.trackingNumber !== undefined) {
    updates.push("tracking_number = ?");
    params.push(String(body.trackingNumber).trim().slice(0, 100));
  }

  if (body.carrier !== undefined) {
    updates.push("carrier = ?");
    params.push(String(body.carrier).trim().slice(0, 100));
  }

  if (!updates.length) {
    throw new HttpError(400, "No updatable fields provided.");
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT order_id FROM orders WHERE order_id = ?")
    .get(req.params.orderId);
  if (!existing) throw new HttpError(404, "Order not found.");

  updates.push("updated_at = ?");
  params.push(nowIso());

  db.prepare(`UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`).run(
    ...params,
    req.params.orderId
  );

  const row = db
    .prepare("SELECT * FROM orders WHERE order_id = ?")
    .get(req.params.orderId);
  res.json({ order: orderRowToApi(row) });
});

// POST /api/admin/orders/:orderId/cancel — cancels the order and restores stock
router.post("/orders/:orderId/cancel", (req, res) => {
  const db = getDb();

  const result = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM orders WHERE order_id = ?")
      .get(req.params.orderId);
    if (!row) throw new HttpError(404, "Order not found.");
    if (row.fulfilment_status === "cancelled") {
      throw new HttpError(400, "Order is already cancelled.");
    }

    let items = [];
    try {
      items = JSON.parse(row.items);
    } catch (error) {
      items = [];
    }

    const restore = db.prepare(
      "UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?"
    );
    for (const item of items) {
      restore.run(Number(item.qty) || 0, nowIso(), item.productId);
    }

    db.prepare(
      "UPDATE orders SET fulfilment_status = 'cancelled', updated_at = ? WHERE order_id = ?"
    ).run(nowIso(), row.order_id);

    return db.prepare("SELECT * FROM orders WHERE order_id = ?").get(row.order_id);
  })();

  res.json({ order: orderRowToApi(result) });
});

// GET /api/admin/products — full inventory (includes inactive products)
router.get("/products", (req, res) => {
  const rows = getDb().prepare("SELECT * FROM products ORDER BY rowid ASC").all();
  res.json({ products: rows.map(productRowToApi), total: rows.length });
});

// PATCH /api/admin/products/:id — update stock, active, price, featured
router.patch("/products/:id", (req, res) => {
  const body = req.body || {};
  const updates = [];
  const params = [];

  if (body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new HttpError(400, "Stock must be a non-negative integer.");
    }
    updates.push("stock = ?");
    params.push(stock);
  }

  if (body.active !== undefined) {
    updates.push("active = ?");
    params.push(body.active ? 1 : 0);
  }

  if (body.featured !== undefined) {
    updates.push("featured = ?");
    params.push(body.featured ? 1 : 0);
  }

  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new HttpError(400, "Price must be a positive number.");
    }
    updates.push("price = ?");
    params.push(Math.round(price));
  }

  if (!updates.length) throw new HttpError(400, "No updatable fields provided.");

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM products WHERE id = ?")
    .get(req.params.id);
  if (!existing) throw new HttpError(404, "Product not found.");

  updates.push("updated_at = ?");
  params.push(nowIso());

  db.prepare(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`).run(
    ...params,
    req.params.id
  );

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json({ product: productRowToApi(row) });
});

module.exports = router;
