// Generates data/admin.json with a PBKDF2-SHA256 password hash (client-side
// login gate for the static admin page). Run ONCE, then git push data/admin.json
// (or keep it local-only if you never want others to attempt logins).
//
// IMPORTANT: client-side auth is NOT real security — this gate only stops
// casual visitors. A genuinely secure admin requires a server, which this
// static site cannot run.
//
// Usage:
//   node scripts/set-admin-password.js [username] [password]
//   node scripts/set-admin-password.js admin MySecret!42
//   NODE=1 ... if data/admin.json exists it will NOT be overwritten unless --force.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ITERATIONS = 210000;
const KEY_BYTES = 32;

const file = path.join(__dirname, "..", "data", "admin.json");

function usage() {
  console.log("Usage: node scripts/set-admin-password.js <username> <password> [--force]");
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const positional = args.filter((a) => a !== "--force");

if (positional.length !== 2) usage();
const [username, password] = positional;

if (!username || !password || password.length < 8) {
  console.error("Username is required and password must be at least 8 characters.");
  usage();
}

if (fs.existsSync(file) && !force) {
  console.error(
    `data/admin.json already exists. Remove it or re-run with --force. ` +
      `(Never push a credentials file if you do not control who reads the repo.)`
  );
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, "sha256")

const doc = {
  user: username,
  iterations: ITERATIONS,
  salt: salt.toString("hex"),
  hash: hash.toString("hex"),
  _comment:
    "Client-side login gate only — NOT server-grade security. " +
    "PBKDF2-SHA256 hash; password is never stored in plain text.",
};

fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${file}`);
console.log(`Login user    : ${username}`);
console.log("Do NOT lose the password — it cannot be recovered.");