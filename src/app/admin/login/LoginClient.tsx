"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => sp?.get("next") || "/admin", [sp]);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error || "Login failed");
        setLoading(false);
        return;
      }

      router.replace(nextPath);
    } catch {
      setError("Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: "20px auto" }}>
      <h2 style={{ marginTop: 0 }}>Admin Login</h2>

      <form onSubmit={onSubmit}>
        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />

        {error && (
          <div style={{ marginTop: 10, color: "#b00020" }}>{error}</div>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}