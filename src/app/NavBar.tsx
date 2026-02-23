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
        style={{ display: "flex", alignItems: "center", gap: 16 }}
      >
        <Link href="/" className="brand">
          🍺 Beer Caps DB
        </Link>

        <Link href="/caps" className={pathname === "/caps" ? "active" : ""}>
          Caps
        </Link>

        <Link
          href="/tag-search"
          className={pathname === "/tag-search" ? "active" : ""}
        >
          Tag Search
        </Link>

        <Link
          href="/admin"
          className={pathname?.startsWith("/admin") ? "active" : ""}
        >
          Admin
        </Link>

        {/* Push logout to the right */}
        <div style={{ marginLeft: "auto" }}>
          {isAdminArea && <AdminLogoutButton />}
        </div>
      </div>
    </header>
  );
}