"use client";

import React, { useMemo, useState } from "react";

type HeaderRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;
  entry_date: string;
  issued_year: number | null;
  trade_type: string;

  country_name_full: string;

  source_name: string | null;

  has_photo: boolean;
  has_barcode: boolean;
  barcode_rows: number;
  duplicates: number;
};

type BarcodeRow = {
  barcode_row_id: number;
  beer_cap_id: number;
  barcode: string;
  sheet: string | null;
  control_bar: number;
};

type Integrity = { ok: boolean; issues: string[] };

type FindResponse =
  | { mode: "no_photo_no_barcode"; header: HeaderRow }
  | { mode: "has_photo"; header: HeaderRow }
  | { mode: "barcode_path"; header: HeaderRow; barcodes: BarcodeRow[]; integrity: Integrity };

function toInt(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function DeleteCapPage() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [result, setResult] = useState<FindResponse | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null); // barcode_row_id loading

  const header = result?.header ?? null;
  const barcodes = (result && result.mode === "barcode_path" ? result.barcodes : []) as BarcodeRow[];
  const integrity = result && result.mode === "barcode_path" ? result.integrity : null;

  const hasAnyDuplicatesOrReserved = useMemo(() => {
    return barcodes.some((b) => b.control_bar === 2 || b.control_bar === 3);
  }, [barcodes]);

  const hasReserved = useMemo(() => {
    return barcodes.some((b) => b.control_bar === 3);
  }, [barcodes]);

  const onlyOneBarcodeRow = useMemo(() => barcodes.length === 1, [barcodes]);

  const originalRowId = useMemo(() => {
    const r = barcodes.find((b) => b.control_bar === 1);
    return r ? r.barcode_row_id : null;
  }, [barcodes]);

  function reset() {
    setId("");
    setLoading(false);
    setErr(null);
    setResult(null);
    setActionMsg(null);
    setActionLoading(null);
  }

  async function find() {
    try {
      setLoading(true);
      setErr(null);
      setActionMsg(null);
      setResult(null);

      const capId = toInt(id);
      if (!capId) {
        setErr("Enter a valid cap id.");
        return;
      }

      const res = await fetch("/api/admin/delete-cap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", id: capId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Find failed");

      setResult(json as FindResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Find failed");
    } finally {
      setLoading(false);
    }
  }

  async function releaseDuplicate(barcode_row_id: number) {
    try {
      setActionLoading(barcode_row_id);
      setActionMsg(null);
      setErr(null);

      const res = await fetch("/api/admin/delete-cap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_duplicate", barcode_row_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Release failed");

      setActionMsg("Released.");
      await find(); // refetch current state
    } catch (e: any) {
      setErr(e?.message ?? "Release failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function releaseOriginalAndDelete(barcode_row_id: number) {
    try {
      setActionLoading(barcode_row_id);
      setActionMsg(null);
      setErr(null);

      const res = await fetch("/api/admin/delete-cap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_original_delete", barcode_row_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Release/deletion failed");

      setActionMsg("Released original + deleted cap.");
      setResult(null);
      setId("");
    } catch (e: any) {
      setErr(e?.message ?? "Release/deletion failed");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <h1>Delete beer cap</h1>
      <p className="muted">
        This module deletes caps that have <b>no photo</b> and <b>barcodes</b>.
        It releases barcodes (sets <code>control_bar</code> to 0 and clears cap link)
        one-by-one. The final step deletes the cap and its tags.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Find cap</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ width: 160 }}
            placeholder="Cap ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />

          <button
            className="button"
            type="button"
            onClick={find}
            disabled={loading}
            style={{ padding: "6px 10px" }}
          >
            {loading ? "Finding..." : "Find"}
          </button>

          <button
            className="button"
            type="button"
            onClick={reset}
            disabled={loading || actionLoading != null}
            style={{ padding: "6px 10px" }}
          >
            Reset
          </button>
        </div>

        {err && (
          <div className="card" style={{ marginTop: 10, borderColor: "crimson" }}>
            <b>Error:</b> {err}
          </div>
        )}

        {actionMsg && (
          <div className="card" style={{ marginTop: 10, borderColor: "green" }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="card" style={{ marginTop: 12 }}>
          {/* Common header display */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <b>ID:</b> {header?.id}
            </div>
            <div>
              <b>Beer:</b> {header?.beer_name} <span className="muted">#{header?.cap_no}</span>
            </div>
            <div>
              <b>Country:</b> {header?.country_name_full}
            </div>
            <div>
              <b>Entry date:</b> {header?.entry_date}
            </div>
          </div>

          {/* Case routing */}
          {result.mode === "no_photo_no_barcode" && (
            <div style={{ marginTop: 10 }}>
              <div className="card">
                This cap has <b>no photo</b> and <b>no barcode</b>. Use{" "}
                <a href="/admin/quick-edit">Quick edit/remove beer caps</a>.
              </div>
            </div>
          )}

          {result.mode === "has_photo" && (
            <div style={{ marginTop: 10 }}>
              <div className="card">
                This cap <b>has a photo</b>. Delete the photo first in{" "}
                <a href="/admin/photo-audit">Photo audit</a>.
              </div>
            </div>
          )}

          {result.mode === "barcode_path" && (
            <div style={{ marginTop: 10 }}>
              {/* Details table */}
              <table className="table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Beer name</th>
                    <th>Cap no</th>
                    <th>Country</th>
                    <th>Sheet</th>
                    <th>Entry date</th>
                    <th>Duplicates</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{header?.id}</td>
                    <td>{header?.beer_name}</td>
                    <td>{header?.cap_no}</td>
                    <td>{header?.country_name_full}</td>
                    <td>{header?.sheet ?? "-"}</td>
                    <td>{header?.entry_date}</td>
                    <td>{header?.duplicates ?? 0}</td>
                  </tr>
                </tbody>
              </table>

              {/* Integrity warnings */}
              {!integrity?.ok && (
                <div className="card" style={{ marginTop: 10, borderColor: "crimson" }}>
                  <b>Data integrity error.</b> Actions are disabled.
                  <ul style={{ marginTop: 8 }}>
                    {integrity?.issues?.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}

              {integrity?.ok && hasReserved && (
                <div className="card" style={{ marginTop: 10 }}>
                  <b>Note:</b> This cap has reserved barcodes (<code>control_bar=3</code>). Those
                  barcodes cannot be released here. If only reserved barcodes remain (no duplicates),
                  the cap will not be deletable until the reserved ones are converted elsewhere.
                </div>
              )}

              {integrity?.ok && (
                <div className="muted" style={{ marginTop: 10 }}>
                  Release duplicates one-by-one. When only the original remains, releasing it will
                  delete the cap and unassign tags. The final step is blocked if the cap exists in{" "}
                  <code>trade_caps</code>.
                </div>
              )}

              {/* Cards */}
              <style>{`
                .dc-grid { display: grid; gap: 10px; margin-top: 12px; }
                /* default: 2-4 columns depending on screen */
                .dc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                @media (min-width: 720px) { .dc-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
                @media (min-width: 1100px) { .dc-grid { grid-template-columns: repeat(10, minmax(0, 1fr)); } }

                .dc-card {
                  border: 1px solid #e6e6e6;
                  border-radius: 10px;
                  padding: 10px;
                  background: #fff;
                  min-height: 92px;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                }
                .dc-barcode { font-weight: 700; }
                .dc-sheet { font-size: 12px; }
                .dc-badge {
                  display: inline-block;
                  font-size: 12px;
                  border: 1px solid #ddd;
                  border-radius: 999px;
                  padding: 1px 8px;
                  margin-left: 6px;
                }
              `}</style>

              <div className="dc-grid">
                {barcodes.map((b) => {
                  const isOriginal = b.control_bar === 1;
                  const isDup = b.control_bar === 2;
                  const isReserved = b.control_bar === 3;

                  // UI blocking rules
                  let disabled = !integrity?.ok;
                  let reason: string | null = null;

                  if (!disabled) {
                    if (isReserved) {
                      disabled = true;
                      reason = "Reserved (control_bar=3)";
                    } else if (isOriginal && hasAnyDuplicatesOrReserved) {
                      // original blocked if any other linked barcode exists (2 or 3)
                      disabled = true;
                      reason = "Release duplicates first";
                    } else if (isOriginal && !onlyOneBarcodeRow) {
                      disabled = true;
                      reason = "Release duplicates first";
                    } else if (!isOriginal && !isDup) {
                      disabled = true;
                      reason = "Invalid control_bar";
                    }
                  }

                  const busy = actionLoading === b.barcode_row_id;

                  return (
                    <div key={b.barcode_row_id} className="dc-card">
                      <div>
                        <div className="dc-barcode">
                          {b.barcode}
                          {isOriginal && <span className="dc-badge">original</span>}
                          {isDup && <span className="dc-badge">double</span>}
                          {isReserved && <span className="dc-badge">reserved</span>}
                        </div>

                        <div className="muted dc-sheet" style={{ marginTop: 6 }}>
                          Sheet: {b.sheet ?? "-"}
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <button
                          className="button"
                          type="button"
                          style={{ padding: "6px 10px", width: "100%" }}
                          disabled={disabled || busy}
                          title={reason ?? ""}
                          onClick={() => {
                            if (isDup) return releaseDuplicate(b.barcode_row_id);
                            if (isOriginal) return releaseOriginalAndDelete(b.barcode_row_id);
                          }}
                        >
                          {busy ? "Working..." : "Release"}
                        </button>

                        {reason && (
                          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                            {reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}