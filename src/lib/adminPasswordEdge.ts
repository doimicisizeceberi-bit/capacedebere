// src/lib/adminPasswordEdge.ts
const te = new TextEncoder();

/**
 * Base64-encode bytes (standard base64, matches Node's .toString("base64")).
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa expects "binary string" where each char code is 0-255
  return btoa(binary);
}

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const aBytes = te.encode(a);
  const bBytes = te.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function verifyAdminPasswordEdge(inputPassword: string): Promise<boolean> {
  const password = (inputPassword ?? "").trim();
  if (!password) return false;

  const salt = process.env.ADMIN_PASSWORD_SALT;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plaintext = process.env.ADMIN_PASSWORD;

  // Option B: PBKDF2 (matches your Node implementation EXACTLY)
  if (salt && hash) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      te.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: te.encode(salt), // IMPORTANT: salt treated as UTF-8 string (same as Node code)
        iterations: 200_000,
        hash: "SHA-256",
      },
      keyMaterial,
      32 * 8 // 32 bytes
    );

    const derived = new Uint8Array(derivedBits);
    const derivedB64 = bytesToBase64(derived);

    // Node compares UTF-8 bytes of the base64 strings, so we do the same.
    return timingSafeEqualUtf8(derivedB64, hash);
  }

  // Option A: plaintext password (same behavior as Node)
  if (plaintext) {
    return timingSafeEqualUtf8(password, plaintext);
  }

  return false;
}