"use client";

import React, { useEffect, useMemo, useState } from "react";

type ReservedRow = {
  id: number;
  barcode: string;
  sheet: string | null;
  beer_cap_id: number | null;
  control_bar: number;
  reserved_trade_id: number | null;
};

type AvailableInstance = {
  id: number;
  barcode: string;
  sheet: string | null;
  control_bar: number;
  reserved_trade_id: number | null;
};

type CapHeader = {
  id: number;
  beer_name: string;
  cap_no: number;
};

type Trade = {
  id: number;
  status: "pending" | "canceled" | "completed";
  trade_type: "blind" | "scan_based";
  date_started: string;
  trader: { id: number; name: string } | null;
  notes: string | null;
};

export default function TradeDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = React.use(props.params);
  const tradeId = useMemo(() => Number(id), [id]);

  const [trade, setTrade] = useState<Trade | null>(null);
  const [tradeMsg, setTradeMsg] = useState("");

  const isEditable = trade?.status === "pending";

  // Add caps flow
  const [capIdInput, setCapIdInput] = useState("");
  const capId = useMemo(() => Number(capIdInput), [capIdInput]);

  const [capHeader, setCapHeader] = useState<CapHeader | null>(null);
  const [available, setAvailable] = useState<AvailableInstance[]>([]);
  const [availBusy, setAvailBusy] = useState(false);
  const [availMsg, setAvailMsg] = useState("");

  const [scanBarcode, setScanBarcode] = useState("");
  const scanValid = useMemo(() => /^[A-Za-z0-9]{3}$/.test(scanBarcode.trim()), [scanBarcode]);

  const [opBusy, setOpBusy] = useState(false);
  const [opMsg, setOpMsg] = useState("");

  const [addingDone, setAddingDone] = useState(false);

  // Reserved list
  const [reserved, setReserved] = useState<ReservedRow[]>([]);
  const [reservedBusy, setReservedBusy] = useState(false);
  const [reservedMsg, setReservedMsg] = useState("");

  // Completed history
  const [historyRows, setHistoryRows] = useState<
    { beer_cap_id: number; qty: number; cap: { id: number; beer_name: string; cap_no: number } | null }[]
  >([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyMsg, setHistoryMsg] = useState("");

  async function loadHistory() {
    if (!Number.isInteger(tradeId) || tradeId < 1) return;

    setHistoryBusy(true);
    setHistoryMsg("");
    try {
      const res = await fetch(`/api/admin/trades/history?trade_id=${tradeId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setHistoryMsg(json?.error || "Failed to load history");
        setHistoryRows([]);
        return;
      }
      setHistoryRows(json.rows ?? []);
    } catch (e: any) {
      setHistoryMsg(e?.message ?? "Network error");
      setHistoryRows([]);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function loadTradeHeader() {
    try {
      setTradeMsg("");
      const res = await fetch(`/api/admin/trades/get?id=${tradeId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setTradeMsg(json?.error || "Failed to load trade");
        setTrade(null);
        return;
      }

      const t = (json.trade ?? null) as Trade | null;
      setTrade(t);

      if (t?.status === "completed") {
        await loadHistory();
      } else {
        setHistoryRows([]);
      }
    } catch (e: any) {
      setTradeMsg(e?.message ?? "Network error");
    }
  }

  async function loadReserved() {
    if (!Number.isInteger(tradeId) || tradeId < 1) return;

    setReservedBusy(true);
    setReservedMsg("");
    try {
      const res = await fetch(`/api/admin/trades/reserved?trade_id=${tradeId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setReservedMsg(json?.error || "Failed to load reserved");
        setReserved([]);
        return;
      }
      setReserved(json.reserved ?? []);
    } catch (e: any) {
      setReservedMsg(e?.message ?? "Network error");
      setReserved([]);
    } finally {
      setReservedBusy(false);
    }
  }

  useEffect(() => {
    if (!Number.isInteger(tradeId) || tradeId < 1) return;
    loadTradeHeader();
    loadReserved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function loadAvailableForCap() {
    if (!Number.isInteger(capId) || capId < 1) {
      setAvailMsg("Enter a valid cap id.");
      setAvailable([]);
      setCapHeader(null);
      return;
    }

    setAvailBusy(true);
    setAvailMsg("");
    setAvailable([]);
    setCapHeader(null);

    try {
      const res = await fetch(`/api/admin/trades/available-duplicates?beerCapId=${capId}&limit=200`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        setAvailMsg(json?.error || "Failed to load available duplicates");
        return;
      }

      setCapHeader(json.cap ?? null);
      setAvailable(json.instances ?? []);

      if (!(json.instances ?? []).length) {
        setAvailMsg("No available duplicates (control_bar=2) for this cap id.");
      }
    } catch (e: any) {
      setAvailMsg(e?.message ?? "Network error");
    } finally {
      setAvailBusy(false);
    }
  }

  async function reserveScannedBarcode() {
    if (opBusy) return;
    if (!trade || trade.status !== "pending") {
      setOpMsg("Trade is not pending. Cannot reserve.");
      return;
    }
    if (!Number.isInteger(capId) || capId < 1) {
      setOpMsg("Enter a cap id first.");
      return;
    }
    if (!scanValid) {
      setOpMsg("Scan a valid 3-char barcode.");
      return;
    }

    const barcode = scanBarcode.trim();

    setOpBusy(true);
    setOpMsg("");

    try {
      const res = await fetch("/api/admin/trades/reserve-barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_id: tradeId,
          beer_cap_id: capId,
          barcode,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setOpMsg(json?.error || "Reserve failed");
        return;
      }

      setOpMsg(`Reserved ${barcode}.`);
      setScanBarcode("");

      await loadAvailableForCap();
      await loadReserved();
    } catch (e: any) {
      setOpMsg(e?.message ?? "Network error");
    } finally {
      setOpBusy(false);
    }
  }

  async function removeReserved(barcode: string) {
    if (opBusy) return;
    if (!trade || trade.status !== "pending") return;

    const ok = window.confirm(`Remove ${barcode} from this trade?`);
    if (!ok) return;

    setOpBusy(true);
    setOpMsg("");

    try {
      const res = await fetch("/api/admin/trades/remove-barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade_id: tradeId, barcode }),
      });
      const json = await res.json();

      if (!res.ok) {
        setOpMsg(json?.error || "Remove failed");
        return;
      }

      setOpMsg(`Removed ${barcode}.`);

      await loadAvailableForCap();
      await loadReserved();
    } catch (e: any) {
      setOpMsg(e?.message ?? "Network error");
    } finally {
      setOpBusy(false);
    }
  }

	const [copiedBarcodeId, setCopiedBarcodeId] = useState<number | null>(null);

	async function onCopyBarcode(id: number, barcode: string) {
	  try {
		await navigator.clipboard.writeText(barcode);
		setCopiedBarcodeId(id);

		// reset label after 1.5s
		setTimeout(() => {
		  setCopiedBarcodeId((prev) => (prev === id ? null : prev));
		}, 1500);
	  } catch {
		alert("Failed to copy");
	  }
	}



  return (
    <>
      <div className="actions" style={{ alignItems: "center", marginBottom: 10 }}>
        <a className="button" href="/admin/trades">
          ← Back
        </a>
        <h1 style={{ margin: 0 }}>Trade #{tradeId}</h1>
      </div>

      {tradeMsg && (
        <div className="help" style={{ color: "crimson", marginBottom: 10 }}>
          {tradeMsg}
        </div>
      )}

      {trade && (
        <div className="help" style={{ marginBottom: 14 }}>
          <b>Trader:</b> {trade.trader?.name ?? "-"} • <b>Type:</b> {trade.trade_type} • <b>Status:</b> {trade.status}
          {trade.notes ? <> • <b>Notes:</b> {trade.notes}</> : null}
        </div>
      )}

      {trade && !isEditable && (
        <div className="help" style={{ marginBottom: 14, color: "#6b7280" }}>
          This trade is <b>{trade.status}</b>. It is read-only.
        </div>
      )}

      <div style={{ margin: "18px 0", borderTop: "1px solid #e5e7eb" }} />

      {/* ADD CAPS */}
      <div className="form">
        <div className="field">
          <label>Add caps to this trade</label>

          <div className="help" style={{ marginTop: 6 }}>
            Enter a cap id (beer_caps.id). Only duplicates (control_bar=2) can be reserved.
          </div>

          <div className="actions" style={{ marginTop: 10, alignItems: "center" }}>
            <input
              className="input"
              value={capIdInput}
              onChange={(e) => setCapIdInput(e.target.value)}
              placeholder="Cap id (e.g. 123)"
              inputMode="numeric"
              disabled={!isEditable || availBusy || opBusy}
              style={{ width: 180 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadAvailableForCap();
              }}
            />

            <button className="button" type="button" onClick={loadAvailableForCap} disabled={!isEditable || availBusy || opBusy}>
              {availBusy ? "Loading..." : "Show available"}
            </button>

            <button
              className="button"
              type="button"
              onClick={() => setAddingDone((v) => !v)}
              disabled={!isEditable || opBusy}
              style={{ opacity: addingDone ? 0.75 : 1 }}
            >
              {addingDone ? "Continue adding" : "Finish adding"}
            </button>
          </div>

          {availMsg && (
            <div
              className="help"
              style={{
                marginTop: 8,
                color: availMsg.toLowerCase().includes("no available") ? "#6b7280" : "crimson",
              }}
            >
              {availMsg}
            </div>
          )}

          {capHeader && (
            <div className="help" style={{ marginTop: 10 }}>
              <b>Cap:</b> #{capHeader.id} • {capHeader.beer_name} • No {capHeader.cap_no}
            </div>
          )}

          {available.length > 0 && (
            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Sheet</th>
					<th>Barcode row id</th>
					<th style={{ textAlign: "right" }}>Copy</th>
                </tr>
              </thead>
              <tbody>
                {available.map((x) => (
				<tr key={x.id}>
				  <td>{x.barcode}</td>
				  <td>{x.sheet ?? "-"}</td>
				  <td>{x.id}</td>
				  <td style={{ textAlign: "right" }}>
					<button
					  className="button"
					  type="button"
					  onClick={() => onCopyBarcode(x.id, x.barcode)}
					  style={{ padding: "6px 10px" }}
					>
					  {copiedBarcodeId === x.id ? "Copied" : "Copy"}
					</button>
				  </td>
				</tr>
                ))}
              </tbody>
            </table>
          )}

          {/* SCAN/RESERVE */}
          {isEditable && !addingDone && (
            <div style={{ marginTop: 14 }}>
              <div className="help">Scan one of the barcodes above to reserve it for this trade.</div>

              <div className="actions" style={{ marginTop: 8, alignItems: "center" }}>
                <input
                  className="input"
                  value={scanBarcode}
                  onChange={(e) => setScanBarcode(e.target.value)}
                  placeholder="Scan 3-char barcode"
                  maxLength={3}
                  disabled={opBusy}
                  style={{ width: 200 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") reserveScannedBarcode();
                  }}
                />

                <button className="button" type="button" onClick={reserveScannedBarcode} disabled={!scanValid || opBusy}>
                  {opBusy ? "Working..." : "Reserve"}
                </button>
              </div>
            </div>
          )}

          {opMsg && (
            <div
              className="help"
              style={{
                marginTop: 10,
                color: /reserved|removed/i.test(opMsg) ? "green" : "crimson",
              }}
            >
              {opMsg}
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: "22px 0", borderTop: "1px solid #e5e7eb" }} />

      {/* RESERVED LIST */}
      <div className="field">
        <label>Reserved in this trade</label>

        <div className="help" style={{ marginTop: 6 }}>
          These are control_bar=3 and linked to this trade via reserved_trade_id.
        </div>

        <div className="actions" style={{ marginTop: 10, alignItems: "center" }}>
          <button className="button" type="button" onClick={loadReserved} disabled={reservedBusy}>
            {reservedBusy ? "Refreshing..." : "Refresh"}
          </button>
          <span className="help">Count: {reserved.length}</span>
          {reservedMsg && <span className="help" style={{ color: "crimson" }}>{reservedMsg}</span>}
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Sheet</th>
              <th>Cap id</th>
              <th>Barcode row id</th>
              <th style={{ textAlign: "right" }}>{isEditable ? "Action" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {reserved.map((r) => (
              <tr key={r.id}>
                <td>{r.barcode}</td>
                <td>{r.sheet ?? "-"}</td>
                <td>{r.beer_cap_id ?? "-"}</td>
                <td>{r.id}</td>
                <td style={{ textAlign: "right" }}>
                  {isEditable ? (
                    <button className="button" type="button" onClick={() => removeReserved(r.barcode)} disabled={opBusy}>
                      Remove
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {reserved.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No reserved caps yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* COMPLETED HISTORY */}
      {trade?.status === "completed" && (
        <>
          <div style={{ margin: "22px 0", borderTop: "1px solid #e5e7eb" }} />

          <div className="field">
            <label>Completed trade history</label>

            <div className="help" style={{ marginTop: 6 }}>
              These counts come from <code>trade_caps</code> (what left your collection).
            </div>

            <div className="actions" style={{ marginTop: 10, alignItems: "center" }}>
              <button className="button" type="button" onClick={loadHistory} disabled={historyBusy}>
                {historyBusy ? "Loading..." : "Refresh history"}
              </button>

              <span className="help">Total traded: {historyRows.reduce((s, r) => s + r.qty, 0)}</span>

              {historyMsg && (
                <span className="help" style={{ color: "crimson" }}>
                  {historyMsg}
                </span>
              )}
            </div>

            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Cap id</th>
                  <th>Beer</th>
                  <th>No</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((r) => (
                  <tr key={r.beer_cap_id}>
                    <td>{r.beer_cap_id}</td>
                    <td>{r.cap?.beer_name ?? "-"}</td>
                    <td>{r.cap?.cap_no ?? "-"}</td>
                    <td>{r.qty}</td>
                  </tr>
                ))}

                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No history rows found for this trade.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }} className="help">
        Next: when you’re done adding, go back and use “Complete” (or “Cancel”) on the main Trades page.
      </div>
    </>
  );
}
