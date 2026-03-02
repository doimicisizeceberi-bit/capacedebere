"use client";

import { useState } from "react";

export default function AdminDatabasePage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [dbFile, setDbFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
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

					// 🔥 Extract filename from response header
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
					a.download = filename; // ← use server filename
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

  async function exportStorage() {
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/storage/export", {
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
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "bucket_photo_caps.zip";
      a.click();

      window.URL.revokeObjectURL(url);

      setMsg("Photos exported successfully.");
    } catch (e: any) {
      setMsg(e?.message || "Export error.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreStorage() {
    if (!zipFile) {
      setMsg("Select a ZIP file.");
      return;
    }

    const confirm = window.prompt(
      "Type RESTORE PHOTOS to confirm hard reset:"
    );

    if (confirm !== "RESTORE PHOTOS") {
      setMsg("Restore cancelled.");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("adminSecret", adminSecret);
      fd.append("file", zipFile);

      const res = await fetch("/api/admin/storage/restore", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(json?.error || "Restore failed.");
        return;
      }

      setMsg(`Photos restored: ${json.uploaded_files}`);
    } catch (e: any) {
      setMsg(e?.message || "Restore error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto" }}>
      <h1>🗄 Admin Backup & Restore</h1>

      <div style={{ marginBottom: 20 }}>
        <label>Admin Password</label>
        <input
          type="password"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <hr />

      <h2>Database</h2>

      <button onClick={exportDB} disabled={busy}>
        Export Database
      </button>

      <div style={{ marginTop: 10 }}>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => setDbFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={restoreDB} disabled={busy}>
          Restore Database
        </button>
      </div>

      <hr style={{ margin: "30px 0" }} />

      <h2>Photos Bucket</h2>

      <button onClick={exportStorage} disabled={busy}>
        Export Photos
      </button>

      <div style={{ marginTop: 10 }}>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={restoreStorage} disabled={busy}>
          Restore Photos
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 20, color: "crimson" }}>
          {msg}
        </div>
      )}
    </div>
  );
}