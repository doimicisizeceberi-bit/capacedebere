"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/AdminLogoutButton";

export default function NavBar() {
  const pathname = usePathname();

  const isAdminArea = pathname?.startsWith("/admin");

  return (
    <header className="navbar">
 <div
  className="container"
  style={{ display: "flex", alignItems: "center" }}
>
  {/* BRAND */}
  <Link href="/" className="brand" style={{ marginRight: 16 }}>
    🍺 Beer Caps DB
  </Link>

  {/* NAV LINKS */}
  <div className="nav-links">
    <Link href="/caps" className={pathname === "/caps" ? "active" : ""}>
      Caps
    </Link>

    <Link
      href="/caps-mobile"
      className={pathname === "/caps-mobile" ? "active" : ""}
    >
      Caps Mobile
    </Link>

    <Link
      href="/caps-quick-view"
      className={pathname === "/caps-quick-view" ? "active" : ""}
    >
      Caps Quick View
    </Link>

    <Link
      href="/tag-search"
      className={pathname === "/tag-search" ? "active" : ""}
    >
      Tag Search
    </Link>

    <Link
      href="/capmap"
      className={pathname === "/capmap" ? "active" : ""}
    >
      CapMap
    </Link>

    <Link
      href="/admin"
      className={pathname?.startsWith("/admin") ? "active" : ""}
    >
      Admin
    </Link>
  </div>

  {/* RIGHT SIDE */}
  <div style={{ marginLeft: "auto" }}>
    {isAdminArea && <AdminLogoutButton />}
  </div>
</div>
    </header>
  );
}