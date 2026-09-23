const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { config } = require("./config");

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT NOT NULL,
  year INTEGER,
  country TEXT NOT NULL DEFAULT '',
  denomination TEXT NOT NULL DEFAULT '',
  "condition" TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  stock INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'UPI',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_reference TEXT NOT NULL DEFAULT '',
  fulfilment_status TEXT NOT NULL DEFAULT 'pending',
  tracking_number TEXT NOT NULL DEFAULT '',
  carrier TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfilment_status ON orders (fulfilment_status);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`;

function getDb() {
  if (db) return db;

  const isMemory = config.dbPath === ":memory:";
  if (!isMemory) {
    fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  }

  db = new Database(config.dbPath);
  if (!isMemory) db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
