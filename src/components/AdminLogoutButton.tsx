"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
      });
    } catch {
      // ignore
    } finally {
      router.replace("/admin/login");
    }
  };

  return (
    <button
      className="button"
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{ padding: "6px 10px", marginLeft: 12 }}
    >
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}