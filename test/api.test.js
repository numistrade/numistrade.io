process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";
process.env.CORS_ORIGIN = "*";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { createApp } = require("../src/app");
const { getDb, closeDb } = require("../src/db");
const { hashPassword } = require("../src/auth");

const app = createApp();
const db = getDb();

const ADMIN_PASSWORD = "correct-horse-battery";

function insertProduct(overrides = {}) {
  const product = {
    id: "coin-001",
    name: "Test Coin",
    slug: "test-coin",
    category: "Republic India",
    year: 1975,
    country: "India",
    denomination: "1 Rupee",
    condition: "Very Fine",
    price: 500,
    currency: "INR",
    stock: 3,
    images: "[]",
    description: "A test coin.",
    featured: 1,
    active: 1,
    demo: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  db.prepare(
    `INSERT INTO products (id, name, slug, category, year, country, denomination, "condition",
      price, currency, stock, images, description, featured, active, demo, created_at, updated_at)
     VALUES (@id, @name, @slug, @category, @year, @country, @denomination, @condition,
      @price, @currency, @stock, @images, @description, @featured, @active, @demo, @created_at, @updated_at)`
  ).run(product);
  return product;
}

const validOrder = {
  customer: { name: "Test Buyer", phone: "9876543210", email: "buyer@example.com" },
  shipping: {
    address: "12 MG Road, Bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "India",
  },
  items: [{ productId: "coin-001", qty: 2, price: 1, lineTotal: 1 }],
};

async function login() {
  const res = await request(app)
    .post("/api/admin/auth/login")
    .send({ username: "admin", password: ADMIN_PASSWORD });
  assert.equal(res.status, 200);
  return res.body.token;
}

before(async () => {
  const hash = await hashPassword(ADMIN_PASSWORD);
  db.prepare(
    "INSERT INTO users (username, password_hash, name, created_at) VALUES (?, ?, ?, ?)"
  ).run("admin", hash, "Administrator", new Date().toISOString());
});

after(() => closeDb());

beforeEach(() => {
  db.prepare("DELETE FROM products").run();
  db.prepare("DELETE FROM orders").run();
  insertProduct();
  insertProduct({ id: "coin-002", slug: "test-coin-2", name: "Rare Coin", price: 1500, stock: 1, featured: 0 });
  insertProduct({ id: "coin-003", slug: "hidden-coin", name: "Hidden Coin", stock: 5, active: 0 });
});

test("GET /api/health returns ok", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("GET /api/products returns active products with correct shape", async () => {
  const res = await request(app).get("/api/products");
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  const product = res.body.products.find((p) => p.id === "coin-001");
  assert.equal(product.price, 500);
  assert.equal(product.stock, 3);
  assert.equal(product.featured, true);
  assert.equal(product.active, true);
  assert.ok(Array.isArray(product.images));
  assert.ok(!res.body.products.some((p) => p.id === "coin-003"), "inactive product excluded");
});

test("GET /api/products/:id returns a product, unknown id 404", async () => {
  const found = await request(app).get("/api/products/coin-002");
  assert.equal(found.status, 200);
  assert.equal(found.body.product.name, "Rare Coin");

  const missing = await request(app).get("/api/products/nope");
  assert.equal(missing.status, 404);
});

test("POST /api/orders creates an order, computes totals server-side, reduces stock", async () => {
  const res = await request(app).post("/api/orders").send(validOrder);
  assert.equal(res.status, 201);

  const order = res.body.order;
  assert.match(order.orderId, /^NT-\d{10}$/);
  assert.equal(order.subtotal, 1000, "server price used, client price ignored");
  assert.equal(order.shippingFee, 50);
  assert.equal(order.total, 1050);
  assert.equal(order.payment.status, "pending");
  assert.equal(order.fulfilment.status, "pending");
  assert.equal(order.items[0].name, "Test Coin");

  const stock = db.prepare("SELECT stock FROM products WHERE id = 'coin-001'").get().stock;
  assert.equal(stock, 1, "stock reduced by ordered quantity");
});

test("POST /api/orders applies free shipping above the threshold", async () => {
  const res = await request(app)
    .post("/api/orders")
    .send({
      ...validOrder,
      items: [
        { productId: "coin-002", qty: 1 },
        { productId: "coin-001", qty: 3 },
      ],
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.order.subtotal, 3000);
  assert.equal(res.body.order.shippingFee, 0, "free delivery above FREE_SHIPPING_OVER");
});

test("POST /api/orders rejects overselling with 409 and leaves stock untouched", async () => {
  const res = await request(app)
    .post("/api/orders")
    .send({ ...validOrder, items: [{ productId: "coin-001", qty: 5 }] });
  assert.equal(res.status, 409);

  const stock = db.prepare("SELECT stock FROM products WHERE id = 'coin-001'").get().stock;
  assert.equal(stock, 3, "stock unchanged after rejected order");
});

test("POST /api/orders rejects inactive products and invalid input", async () => {
  const inactive = await request(app)
    .post("/api/orders")
    .send({ ...validOrder, items: [{ productId: "coin-003", qty: 1 }] });
  assert.equal(inactive.status, 400);

  const badPhone = await request(app)
    .post("/api/orders")
    .send({ ...validOrder, customer: { ...validOrder.customer, phone: "12345" } });
  assert.equal(badPhone.status, 400);

  const badPin = await request(app)
    .post("/api/orders")
    .send({ ...validOrder, shipping: { ...validOrder.shipping, postalCode: "012345" } });
  assert.equal(badPin.status, 400);

  const noItems = await request(app).post("/api/orders").send({ ...validOrder, items: [] });
  assert.equal(noItems.status, 400);
});

test("admin login: wrong password rejected, correct password returns a token", async () => {
  const bad = await request(app)
    .post("/api/admin/auth/login")
    .send({ username: "admin", password: "wrong" });
  assert.equal(bad.status, 401);

  const good = await request(app)
    .post("/api/admin/auth/login")
    .send({ username: "admin", password: ADMIN_PASSWORD });
  assert.equal(good.status, 200);
  assert.ok(good.body.token);
  assert.equal(good.body.admin.username, "admin");
});

test("admin endpoints require a token and list orders", async () => {
  const created = await request(app).post("/api/orders").send(validOrder);
  const orderId = created.body.order.orderId;

  const unauthorized = await request(app).get("/api/admin/orders");
  assert.equal(unauthorized.status, 401);

  const token = await login();
  const res = await request(app)
    .get("/api/admin/orders")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.orders[0].orderId, orderId);
});

test("admin can verify payment, add tracking, and search orders", async () => {
  const created = await request(app).post("/api/orders").send(validOrder);
  const orderId = created.body.order.orderId;
  const token = await login();

  const patched = await request(app)
    .patch(`/api/admin/orders/${orderId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      paymentStatus: "verified",
      paymentReference: "415012345678",
      fulfilmentStatus: "shipped",
      trackingNumber: "TRK123",
      carrier: "India Post",
    });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.order.payment.status, "verified");
  assert.equal(patched.body.order.payment.reference, "415012345678");
  assert.equal(patched.body.order.fulfilment.status, "shipped");
  assert.equal(patched.body.order.fulfilment.trackingNumber, "TRK123");

  const invalid = await request(app)
    .patch(`/api/admin/orders/${orderId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ paymentStatus: "totally-verified" });
  assert.equal(invalid.status, 400);

  const search = await request(app)
    .get(`/api/admin/orders?q=${orderId}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(search.body.total, 1);
});

test("cancelling an order restores stock", async () => {
  const created = await request(app).post("/api/orders").send(validOrder);
  const orderId = created.body.order.orderId;
  const token = await login();

  const afterOrder = db.prepare("SELECT stock FROM products WHERE id = 'coin-001'").get().stock;
  assert.equal(afterOrder, 1);

  const cancelled = await request(app)
    .post(`/api/admin/orders/${orderId}/cancel`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.order.fulfilment.status, "cancelled");

  const restored = db.prepare("SELECT stock FROM products WHERE id = 'coin-001'").get().stock;
  assert.equal(restored, 3, "stock restored after cancellation");

  const again = await request(app)
    .post(`/api/admin/orders/${orderId}/cancel`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(again.status, 400, "cannot cancel twice");
});

test("customer order lookup requires the matching phone number", async () => {
  const created = await request(app).post("/api/orders").send(validOrder);
  const orderId = created.body.order.orderId;

  const withPhone = await request(app)
    .get(`/api/orders/${orderId}?phone=9876543210`);
  assert.equal(withPhone.status, 200);
  assert.equal(withPhone.body.order.orderId, orderId);

  const wrongPhone = await request(app)
    .get(`/api/orders/${orderId}?phone=9000000000`);
  assert.equal(wrongPhone.status, 404);

  const noPhone = await request(app).get(`/api/orders/${orderId}`);
  assert.equal(noPhone.status, 400);
});

test("payment reference submission keeps payment pending until admin verifies", async () => {
  const created = await request(app).post("/api/orders").send(validOrder);
  const orderId = created.body.order.orderId;

  const res = await request(app)
    .post(`/api/orders/${orderId}/reference`)
    .send({ phone: "9876543210", reference: "415098765432" });
  assert.equal(res.status, 200);
  assert.equal(res.body.order.payment.reference, "415098765432");
  assert.equal(res.body.order.payment.status, "submitted", "not verified — admin must verify");

  const wrongPhone = await request(app)
    .post(`/api/orders/${orderId}/reference`)
    .send({ phone: "9000000000", reference: "415098765432" });
  assert.equal(wrongPhone.status, 404);
});

test("admin can update inventory", async () => {
  const token = await login();

  const res = await request(app)
    .patch("/api/admin/products/coin-001")
    .set("Authorization", `Bearer ${token}`)
    .send({ stock: 42, active: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.product.stock, 42);
  assert.equal(res.body.product.active, false);

  const publicList = await request(app).get("/api/products");
  assert.ok(!publicList.body.products.some((p) => p.id === "coin-001"), "inactive product hidden");

  const bad = await request(app)
    .patch("/api/admin/products/coin-001")
    .set("Authorization", `Bearer ${token}`)
    .send({ stock: -5 });
  assert.equal(bad.status, 400);
});
