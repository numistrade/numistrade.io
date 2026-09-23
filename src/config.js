require("dotenv").config();

const isTest = process.env.NODE_ENV === "test";

const config = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || "./data/numistrade.sqlite",
  jwtSecret: process.env.JWT_SECRET || (isTest ? "test-secret" : ""),
  jwtExpires: process.env.JWT_EXPIRES || "7d",
  corsOrigins: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  shippingFee: Number(process.env.SHIPPING_FEE ?? 50),
  freeShippingOver: Number(process.env.FREE_SHIPPING_OVER ?? 2000),
};

function assertRuntimeConfig() {
  if (!config.jwtSecret) {
    throw new Error(
      "JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set JWT_SECRET."
    );
  }
}

module.exports = { config, assertRuntimeConfig };
