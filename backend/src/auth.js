const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { config } = require("./config");
const { getDb } = require("./db");

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpires,
  });
}

function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const user = getDb()
    .prepare("SELECT id, username, name, is_active FROM users WHERE id = ?")
    .get(payload.sub);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "Account not found or disabled." });
  }

  req.admin = { id: user.id, username: user.username, name: user.name };
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, authenticateAdmin };
