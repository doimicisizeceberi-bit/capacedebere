// src/lib/adminSessionEdge.ts
export const ADMIN_COOKIE = "admin_session";

/**
 * 7 days
 */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSignEdge(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(sig);
}

export async function createAdminSessionTokenEdge(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + SESSION_TTL_SECONDS };
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSignEdge(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export async function verifyAdminSessionTokenEdge(token: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadB64, sig] = parts;
  const expectedSig = await hmacSignEdge(payloadB64, secret);

  const a = b64urlDecodeToBytes(sig);
  const b = b64urlDecodeToBytes(expectedSig);
  if (!timingSafeEqual(a, b)) return false;

  try {
    const payloadJson = new TextDecoder().decode(b64urlDecodeToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    const now = Math.floor(Date.now() / 1000);
    return typeof payload?.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}