import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminSessionEdge";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const isProd = process.env.NODE_ENV === "production";

  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}