const crypto = require("crypto");

const password = process.argv[2];
if (!password) {
  console.log('Usage: node scripts/gen-admin-hash.js "your password"');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("base64");
const derived = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256").toString("base64");

console.log("ADMIN_PASSWORD_SALT=" + salt);
console.log("ADMIN_PASSWORD_HASH=" + derived);