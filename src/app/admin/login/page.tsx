"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => sp.get("next") || "/admin", [sp]);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error || "Login failed");
        setLoading(false);
        return;
      }

      router.replace(nextPath);
    } catch (e: any) {
      setErr(e?.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 520, margin: "20px auto" }}>
      <h1 style={{ marginTop: 0 }}>Admin Login</h1>

      <form onSubmit={onSubmit}>
        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Enter admin password"
        />

        {err ? (
          <div className="card" style={{ marginTop: 10, border: "1px solid #f3b4b4" }}>
            {err}
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}