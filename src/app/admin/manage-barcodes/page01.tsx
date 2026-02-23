"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

type MissingCap = {
  id: number;
  beer_name: string;
  cap_no: number;
  caps_country: { country_name_full: string } | null;
};

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
	JsBarcode(ref.current, value, {
	  format: "CODE128",
	  displayValue: false,
	  margin: 0,
	  height: 70,      // taller bars (critical for scanners)
	  width: 1.2,      // bar “module” width (tune 1.0–1.6 if needed)
	});

  }, [value]);

	return <svg ref={ref} className="barcode-svg" />;
}

export default function ManageBarcodesPage() {
  const [totalCaps, setTotalCaps] = useState(0);
  const [missingCount, setMissingCount] = useState(0);

const [copySheet, setCopySheet] = useState("");


  const [missingCaps, setMissingCaps] = useState<MissingCap[]>([]);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);

  const [capId, setCapId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [labelOpen, setLabelOpen] = useState(false);
  const [labelBarcode, setLabelBarcode] = useState<string>("");
  const [labelCapId, setLabelCapId] = useState<number | null>(null);

  const capIdNumber = useMemo(() => Number(capId), [capId]);

  const loadSummary = async () => {
    const res = await fetch("/api/admin/manage-barcodes/summary", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setTotalCaps(json.total_caps ?? 0);
      setMissingCount(json.missing_barcodes ?? 0);
    }
  };

  const loadMissing = async (lim: number) => {
    const res = await fetch(`/api/admin/manage-barcodes/missing?limit=${lim}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setMissingCaps(json.caps || []);
  };

  useEffect(() => {
    loadSummary();
    loadMissing(limit);
  }, [limit]);

const generateFor = async (beerCapId: number, sheet?: string) => {

    setMsg("");
    const res = await fetch("/api/admin/manage-barcodes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beerCapId, sheet: sheet ?? "" }),

    });
    const json = await res.json();

    if (!res.ok) {
      setMsg(json?.error || "Failed to generate barcode");
      return;
    }

    setLabelBarcode(json.barcode);
    setLabelCapId(json.beerCapId);
    setLabelOpen(true);

	setCopySheet("");

    // refresh lists
    await loadSummary();
    await loadMissing(limit);
  };

  return (
    <>
      <h1>Manage barcodes</h1>

      <div className="audit-summary">
        <div className="stat-card">
          <div className="stat-label">Total caps</div>
          <div className="stat-value">{totalCaps}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Missing barcodes</div>
          <div className="stat-value">{missingCount}</div>
        </div>
      </div>

      <div className="form">
        <div className="field">
          <label>Caps missing barcodes</label>

          <div className="actions" style={{ alignItems: "center" }}>
            <span className="pager-label">Show</span>
            <select
              className="pager-select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) as 10 | 50 | 100)}
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="pager-label">items</span>
          </div>

          <table className="table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Beer</th>
                <th>No</th>
                <th>Country</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {missingCaps.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.beer_name}</td>
                  <td>{c.cap_no}</td>
                  <td>{c.caps_country?.country_name_full ?? "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="button" type="button" onClick={() => generateFor(c.id)}>
                      Generate
                    </button>
                  </td>
                </tr>
              ))}
              {missingCaps.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No caps missing barcodes (in the current view).
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {msg && <div className="help" style={{ color: "crimson", marginTop: 8 }}>{msg}</div>}
        </div>

		<div className="field">
		  <label>Add copy barcode (existing cap)</label>

		  <div className="actions">
			<input
			  className="input"
			  value={capId}
			  onChange={(e) => setCapId(e.target.value)}
			  placeholder="Enter cap id (e.g. 123)"
			  inputMode="numeric"
			/>

			<input
			  className="input"
			  value={copySheet}
			  onChange={(e) => setCopySheet(e.target.value)}
			  placeholder="Sheet (e.g. GER-13)"
			  maxLength={10}
			/>

			<button
			  className="button"
			  type="button"
			  onClick={() => generateFor(capIdNumber, copySheet)}
			  disabled={!Number.isInteger(capIdNumber) || capIdNumber < 1}
			>
			  Generate
			</button>
		  </div>

		  <div className="help">
			For copies, enter the sheet where this duplicate is stored.
		  </div>
		</div>

      </div>

      {/* Printable label modal */}
      {labelOpen && (
        <div className="modal-overlay" onClick={() => setLabelOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="barcode-preview">
              <div className="barcode-label">
                <div className="barcode-bars">
                  <BarcodeSvg value={labelBarcode} />
                </div>
                <div className="barcode-text">
                  <div className="barcode-code">{labelBarcode}</div>
                  <div className="barcode-id">id: {labelCapId}</div>
                </div>
              </div>
            </div>

            <div className="actions" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="button" type="button" onClick={() => window.print()}>
                Print
              </button>
              <button className="button" type="button" onClick={() => setLabelOpen(false)}>
                Close
              </button>
            </div>

            <div className="help" style={{ marginTop: 10 }}>
              Print tip: set scale to <b>100%</b> and disable margins if your printer driver adds them.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
