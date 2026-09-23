/* Seeds the database from ../data/products.json and creates the first admin user.
   Re-running is safe: existing products keep their current stock (the database
   is authoritative for inventory); catalog details are refreshed from the JSON. */

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const { getDb } = require("./db");
const { hashPassword } = require("./auth");

const INSERT_OR_UPDATE = `
INSERT INTO products (
  id, name, slug, category, year, country, denomination, "condition",
  price, currency, stock, images, description, featured, active, demo,
  created_at, updated_at
) VALUES (
  @id, @name, @slug, @category, @year, @country, @denomination, @condition,
  @price, @currency, @stock, @images, @description, @featured, @active, @demo,
  @timestamp, @timestamp
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  category = excluded.category,
  year = excluded.year,
  country = excluded.country,
  denomination = excluded.denomination,
  "condition" = excluded."condition",
  price = excluded.price,
  currency = excluded.currency,
  images = excluded.images,
  description = excluded.description,
  featured = excluded.featured,
  active = excluded.active,
  demo = excluded.demo,
  updated_at = excluded.updated_at
`;

async function seed() {
  const db = getDb();
  const timestamp = new Date().toISOString();

  const jsonPath = path.resolve(__dirname, "../../data/products.json");
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const list = Array.isArray(data) ? data : data.products || [];

  const upsert = db.prepare(INSERT_OR_UPDATE);
  const insertMany = db.transaction((products) => {
    for (const product of products) {
      upsert.run({
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        year: product.year == null ? null : Number(product.year),
        country: product.country || "",
        denomination: product.denomination || "",
        condition: product.condition || "",
        price: Math.round(Number(product.price) || 0),
        currency: product.currency || "INR",
        stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        images: JSON.stringify(Array.isArray(product.images) ? product.images : []),
        description: product.description || "",
        featured: product.featured ? 1 : 0,
        active: product.active === false ? 0 : 1,
        demo: product.demo ? 1 : 0,
        timestamp,
      });
    }
  });
  insertMany(list);
  console.log(`Seeded/updated ${list.length} products from ${jsonPath}`);

  const existingAdmin = db.prepare("SELECT username FROM users LIMIT 1").get();
  if (existingAdmin) {
    console.log(`Admin user already exists ("${existingAdmin.username}") — skipped.`);
    return;
  }

  const username = process.env.ADMIN_USERNAME || "admin";
  let password = process.env.ADMIN_PASSWORD || "";
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString("base64url");
    generated = true;
  }

  const hash = await hashPassword(password);
  db.prepare(
    "INSERT INTO users (username, password_hash, name, created_at) VALUES (?, ?, ?, ?)"
  ).run(username, hash, "Administrator", timestamp);

  console.log(`Created admin user "${username}".`);
  if (generated) {
    console.log(`Generated password (save it now, it will not be shown again): ${password}`);
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
