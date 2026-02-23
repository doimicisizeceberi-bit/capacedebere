import { NextResponse } from "next/server";
import { verifyAdminPasswordNode } from "@/lib/adminPasswordNode";
import { ADMIN_COOKIE, createAdminSessionTokenEdge } from "@/lib/adminSessionEdge";

export const runtime = "nodejs";

function getCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");

    const ok = await verifyAdminPasswordNode(password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const secret = process.env.ADMIN_AUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Missing ADMIN_AUTH_SECRET" }, { status: 500 });
    }

    // token generation uses WebCrypto-compatible helper (works fine in Node too)
    const token = await createAdminSessionTokenEdge(secret);

    const res = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === "production";

    res.cookies.set(ADMIN_COOKIE, token, getCookieOptions(isProd));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}