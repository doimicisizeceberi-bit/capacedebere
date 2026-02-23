// src/lib/adminPasswordNode.ts
import crypto from "crypto";

export async function verifyAdminPasswordNode(inputPassword: string): Promise<boolean> {
  const password = (inputPassword ?? "").trim();
  if (!password) return false;

  const salt = process.env.ADMIN_PASSWORD_SALT;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plaintext = process.env.ADMIN_PASSWORD;

  // Option B: PBKDF2 (recommended)
  if (salt && hash) {
    const derived = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256").toString("base64");
    const a = Buffer.from(derived, "utf8");
    const b = Buffer.from(hash, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // Option A: plaintext password
  if (plaintext) {
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(plaintext, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return false;
}