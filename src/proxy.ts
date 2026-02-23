// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminSessionTokenEdge } from "@/lib/adminSessionEdge";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/auth/login";

  if ((isAdminPage && !isLoginPage) || (isAdminApi && !isLoginApi)) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value || "";
    const secret = process.env.ADMIN_AUTH_SECRET || "";

    const ok = await verifyAdminSessionTokenEdge(token, secret);

    if (!ok) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};