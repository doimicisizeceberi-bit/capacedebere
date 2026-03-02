"use client";

import { useState } from "react";

export default function AdminDatabasePage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [dbFile, setDbFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function exportDB() {
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/db/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret }),
      });

      if (!res.ok) {
        const j = await res.json();
        setMsg(j?.error || "Export failed.");
        return;
      }

      const blob = await res.blob();

      const disposition = res.headers.get("Content-Disposition");
      let filename = "db_caps_backup.json";

      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      setMsg("Database exported successfully.");
    } catch (e: any) {
      setMsg(e?.message || "Export error.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreDB() {
    if (!dbFile) {
      setMsg("Select a database JSON file.");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      const text = await dbFile.text();
      const backup = JSON.parse(text);

      const confirm = window.prompt(
        "Type RESTORE DATABASE to confirm full wipe:"
      );

      if (confirm !== "RESTORE DATABASE") {
        setMsg("Restore cancelled.");
        setBusy(false);
        return;
      }

      const res = await fetch("/api/admin/db/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret, backup }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(json?.error || "Restore failed.");
        return;
      }

      setMsg("Database restored successfully.");
    } catch (e: any) {
      setMsg(e?.message || "Restore error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto" }}>
      <h1>🗄 Admin Database Backup & Restore</h1>

      <div style={{ marginBottom: 20 }}>
        <label>Export-db Password</label>
        <input
          type="password"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div
        style={{
          background: "#fff3cd",
          padding: 12,
          borderRadius: 6,
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        ⚠ This backup includes <b>database data only</b>.  
        Storage bucket files (photos) must be backed up separately
        using Supabase Dashboard or CLI.
      </div>

      <h2>Database</h2>

      <button onClick={exportDB} disabled={busy || !adminSecret}>
        Export Database
      </button>

      <div style={{ marginTop: 10 }}>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => setDbFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={restoreDB} disabled={busy || !adminSecret}>
          Restore Database
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 20, color: msg.includes("success") ? "green" : "crimson" }}>
          {msg}
        </div>
      )}
    </div>
  );
}