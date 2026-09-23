const express = require("express");
const cors = require("cors");
const { config } = require("./config");
const { getDb } = require("./db");
const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");
const { HttpError } = require("./validate");

function createApp() {
  getDb(); // ensure schema exists

  const app = express();
  app.disable("x-powered-by");

  app.use(
    cors({
      origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    })
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "numistrade-api", time: new Date().toISOString() });
  });

  app.use("/api", publicRoutes);
  app.use("/api/admin", adminRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
