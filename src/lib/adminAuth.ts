// src/lib/adminAuth.ts
export const ADMIN_COOKIE = "admin_session";

/**
 * Session duration (seconds)
 * Example: 7 days
 */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64urlEncode(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  const b64 = Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  // Works in Node runtime.
  const cryptoMod = await import("crypto");
  const h = cryptoMod.createHmac("sha256", secret);
  h.update(message);
  const sig = h.digest(); // Buffer
  return b64urlEncode(new Uint8Array(sig));
}

export function getCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}

export type AdminSessionPayload = {
  iat: number; // issued-at unix seconds
  exp: number; // expiry unix seconds
};

export async function createAdminSessionToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = { iat: now, exp: now + SESSION_TTL_SECONDS };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export async function verifyAdminSessionToken(token: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadB64, sig] = parts;
  const expectedSig = await hmacSign(payloadB64, secret);

  const a = b64urlDecodeToBytes(sig);
  const b = b64urlDecodeToBytes(expectedSig);
  if (!timingSafeEqual(a, b)) return false;

  try {
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    const payload = JSON.parse(payloadJson) as AdminSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    return typeof payload?.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

/**
 * Password verification
 * - Option A: plaintext ADMIN_PASSWORD
 * - Option B: PBKDF2 with ADMIN_PASSWORD_SALT + ADMIN_PASSWORD_HASH
 */
export async function verifyAdminPassword(inputPassword: string): Promise<boolean> {
  const password = (inputPassword ?? "").trim();
  if (!password) return false;

  const plaintext = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_PASSWORD_SALT;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  // Option B (recommended): PBKDF2
  if (salt && hash) {
    const cryptoMod = await import("crypto");
    const derived = cryptoMod.pbkdf2Sync(password, salt, 200_000, 32, "sha256");
    const derivedB64 = derived.toString("base64");
    // constant-time compare
    const a = Buffer.from(derivedB64, "utf8");
    const b = Buffer.from(hash, "utf8");
    return a.length === b.length && cryptoMod.timingSafeEqual(a, b);
  }

  // Option A: plaintext env
  if (plaintext) {
    // constant-time compare
    const cryptoMod = await import("crypto");
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(plaintext, "utf8");
    return a.length === b.length && cryptoMod.timingSafeEqual(a, b);
  }

  // Nothing configured
  return false;
}