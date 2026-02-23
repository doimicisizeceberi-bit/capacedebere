"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import bwipjs from "bwip-js";

type MissingCap = {
  id: number;
  beer_name: string;
  cap_no: number;
  caps_country: { country_name_full: string } | null;
};

type InspectInstance = {
  id: number;
  barcode: string;
  beer_cap_id: number | null;
  sheet: string | null;
  control_bar: number;
  control_label: string;
};

type InspectCapRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;

  photo_caps: { photo_path: string } | null;
  caps_country: { country_name_full: string } | null;

  entry_date?: string | null;
  issued_year?: number | null;

  caps_sources?: { source_name: string } | null;
  beer_caps_tags?: { tags: { tag: string } | null }[] | null;
};


export default function ManageBarcodesPage() {
	
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	useEffect(() => {
	  const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") setPreviewUrl(null);
	  };
	  window.addEventListener("keydown", onKeyDown);
	  return () => window.removeEventListener("keydown", onKeyDown);
	}, []);


	const [scanValue, setScanValue] = useState("");
	const [scanBusy, setScanBusy] = useState(false);
	const [scanMsg, setScanMsg] = useState("");
	const [scanResult, setScanResult] = useState<null | { instance: InspectInstance; cap: InspectCapRow | null }>(null);

	const scanValid = useMemo(() => /^[A-Za-z0-9]{3}$/.test(scanValue.trim()), [scanValue]);

	async function checkBarcodeStatus() {
	  if (!scanValid || scanBusy) return;

	  const code = scanValue.trim();
	  setScanBusy(true);
	  setScanMsg("");
	  setScanResult(null);

	  try {
		const res = await fetch(`/api/admin/manage-barcodes/inspect?barcode=${encodeURIComponent(code)}`, {
		  cache: "no-store",
		});
		const json = await res.json();

		if (!res.ok) {
		  setScanMsg(json?.error || "Failed to inspect barcode");
		  return;
		}

		setScanResult(json);
	  } catch (e: any) {
		setScanMsg(e?.message ?? "Network error");
	  } finally {
		setScanBusy(false);
	  }
	}


	
	const [switchBarcode, setSwitchBarcode] = useState("");
	const [switchMsg, setSwitchMsg] = useState<string>("");
	const [switchBusy, setSwitchBusy] = useState(false);

	const isSwitchValid = useMemo(() => /^[A-Za-z0-9]{3}$/.test(switchBarcode.trim()), [switchBarcode]);

	async function switchOriginalFlow() {
	  if (!isSwitchValid || switchBusy) return;

	  setSwitchMsg("");
	  setSwitchBusy(true);

	  const barcode = switchBarcode.trim();

	  try {
		// 1) Get status
		const stRes = await fetch("/api/admin/manage-barcodes/switch-original", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ barcode, confirm: false }),
		});
		const stJson = await stRes.json();

		if (!stRes.ok) {
		  setSwitchMsg(stJson?.error || "Failed to check barcode");
		  return;
		}

		const control = stJson.control_bar as number;

		// Disable reasons
		if (control === 3) {
		  setSwitchMsg("This barcode is pending trade (control 3). Switch disabled.");
		  return;
		}
		if (control === 0) {
		  setSwitchMsg("This barcode is unassigned (control 0). Switch disabled.");
		  return;
		}
		if (control === 1) {
		  setSwitchMsg("This barcode is already original (control 1). Switch disabled.");
		  return;
		}
		if (control !== 2) {
		  setSwitchMsg(`Unexpected state (control ${control}). Switch disabled.`);
		  return;
		}

		// 2) Confirm
		const ok = window.confirm("Make this cap original? (This will swap barcodes with the current original.)");
		if (!ok) return;

		// 3) Execute atomic swap
		const swRes = await fetch("/api/admin/manage-barcodes/switch-original", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ barcode, confirm: true }),
		});
		const swJson = await swRes.json();

		if (!swRes.ok) {
		  setSwitchMsg(swJson?.error || "Switch failed");
		  return;
		}

		setSwitchMsg(`Switched. Original is now ${swJson.original_barcode_new} (was ${swJson.original_barcode_old}).`);
		setSwitchBarcode("");

		// optional: refresh summary/missing (not strictly required)
		await loadSummary();
		await loadMissing(limit);
	  } finally {
		setSwitchBusy(false);
	  }
	}
	
	
	
  const [totalCaps, setTotalCaps] = useState(0);
  const [missingCount, setMissingCount] = useState(0);

  const [copySheet, setCopySheet] = useState("");
  const [missingCaps, setMissingCaps] = useState<MissingCap[]>([]);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);

  const [capId, setCapId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [isBusy, setIsBusy] = useState(false);

  // Hidden canvas (same approach as your working PDF generator)
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  async function fetchBeerName(beerCapId: number): Promise<string> {
    const res = await fetch(`/api/admin/manage-barcodes/cap-name?beerCapId=${beerCapId}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to fetch beer name");
    return (json?.beer_name ?? "") as string;
  }

  // Your tested PDF generator logic, unchanged parameters.
  async function generatePdfForBarcode(barcode: string, labelTextRaw: string) {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas not available");

    const normalized = barcode.trim();
    const isValid = /^[A-Za-z0-9]{3}$/.test(normalized);
    if (!isValid) throw new Error("Invalid barcode for PDF");

    // Truncate to first 15 characters
    const labelText = (labelTextRaw ?? "").slice(0, 15);

    // Label size (mm): 20mm wide x 10mm tall
    const W = 20;
    const H = 10;

    // Split: top 75% barcode, bottom 25% text
    const barcodeAreaH = H * 0.75; // 7.5mm
    const textAreaH = H * 0.25; // 2.5mm

    // Barcode placement inside TOP area (mm)
    const marginTop = 0.2;
    const marginBottomInTopArea = 0.2;

    // Quiet zone / horizontal placement
    const marginLeft = 1.5; // left quiet zone
    const marginRight = 0; // keep 0 since 3-char scans well for you

    const barcodeWmm = W - marginLeft - marginRight;
    const barcodeHmm = barcodeAreaH - marginTop - marginBottomInTopArea;

    const xMm = marginLeft;
    const yMm = marginTop;

    // High-DPI canvas to reduce blur (best with Acrobat "Print as image")
    const pxPerMm = 40;
    canvas.width = Math.round(barcodeWmm * pxPerMm);
    canvas.height = Math.round(barcodeHmm * pxPerMm);

	await (bwipjs as any).toCanvas(canvas, {
      bcid: "code128",
      text: normalized,
      includetext: false,

      scale: 4,
      height: 18,

      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF",
    });

    // Force landscape (20w x 10h)
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [10, 20],
    });

    // Add barcode
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", xMm, yMm, barcodeWmm, barcodeHmm, undefined, "FAST");

    // Add bottom text (RIGHT aligned)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);

    const textY = barcodeAreaH + textAreaH * 0.72;
    doc.text(labelText, W - 0.5, textY, { align: "right" });

    // Trigger download
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);

    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${normalized}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const generateFor = async (beerCapId: number, sheet?: string) => {
    if (isBusy) return;

    setMsg("");
    setIsBusy(true);

    try {
      // 1) Create barcode row in DB (your existing endpoint)
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

      const barcode = String(json.barcode || "").trim();
      const capIdFromServer = Number(json.beerCapId);

      // 2) Fetch beer name from DB, truncate to 15 inside PDF generator
      const beerName = await fetchBeerName(capIdFromServer);

      // 3) Generate PDF using your tested parameters
      await generatePdfForBarcode(barcode, beerName);

      setCopySheet("");

      // refresh lists
      await loadSummary();
      await loadMissing(limit);
    } catch (e: any) {
      setMsg(e?.message ?? "Unexpected error");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <h1>Manage barcodes</h1>
	  
	  	<div
		  style={{
			margin: "24px 0",
			borderTop: "1px solid #e5e7eb",
		  }}
		/>

		<div className="field" style={{ marginTop: 12 }}>
		  <label>Check barcode status</label>

		  <div className="help" style={{ marginTop: 6 }}>
			Scan a barcode to verify what it currently represents.
		  </div>

		  <div className="actions" style={{ marginTop: 8, alignItems: "center" }}>
			<input
			  className="input"
			  value={scanValue}
			  onChange={(e) => setScanValue(e.target.value)}
			  placeholder="Scan 3-char barcode (e.g. A0b)"
			  maxLength={3}
			  onKeyDown={(e) => {
				if (e.key === "Enter") checkBarcodeStatus();
			  }}
			  disabled={scanBusy}
			  style={{ width: 220 }}   // ✅ smaller input
			/>


			<button
			  className="button"
			  type="button"
			  onClick={checkBarcodeStatus}
			  disabled={!scanValid || scanBusy}
			>
			  {scanBusy ? "Checking..." : "Check status"}
			</button>
		  </div>

		  {scanMsg && (
			<div className="help" style={{ color: "crimson", marginTop: 8 }}>
			  {scanMsg}
			</div>
		  )}

		  {scanResult && (
			<div style={{ marginTop: 12 }}>
			  <div className="help" style={{ marginBottom: 8 }}>
				<b>Scanned barcode details</b>
			  </div>

			  <table className="table">
				<thead>
				  <tr>
					<th>Barcode</th>
					<th>Control</th>
					<th>Barcode row id</th>
					<th>Instance sheet</th>
					<th>Cap id</th>
				  </tr>
				</thead>
				<tbody>
				  <tr>
					<td>{scanResult.instance.barcode}</td>
					<td>{scanResult.instance.control_label}</td>
					<td>{scanResult.instance.id}</td>
					<td>{scanResult.instance.sheet ?? "-"}</td>
					<td>{scanResult.instance.beer_cap_id ?? "-"}</td>
				  </tr>
				</tbody>
			  </table>

			  {scanResult.cap ? (
				<>
				  <div className="help" style={{ marginTop: 14, marginBottom: 8 }}>
					<b>Cap details</b>
				  </div>

				  <table className="table">
					<thead>
					  <tr>
						<th>Beer</th>
						<th>Cap no</th>
						<th>Country</th>
						<th>Design sheet</th>
						<th>Photo</th>
					  </tr>
					</thead>
					<tbody>
					  <tr>
						<td>{scanResult.cap.beer_name}</td>
						<td>{scanResult.cap.cap_no}</td>
						<td>{scanResult.cap.caps_country?.country_name_full ?? "-"}</td>
						<td>{scanResult.cap.sheet ?? "-"}</td>
						<td>
						  {scanResult.cap.photo_caps?.photo_path ? (
							<img
							  className="thumb"
							  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${scanResult.cap.photo_caps.photo_path}`}
							  alt="cap"
							  style={{ cursor: "zoom-in" }}
							  onClick={(e) => {
								e.stopPropagation();
								setPreviewUrl(
								  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${scanResult.cap.photo_caps.photo_path}`
								);
							  }}
							/>
						  ) : (
							<div className="thumb-placeholder">No photo</div>
						  )}
						</td>

					  </tr>
					</tbody>
				  </table>
				  
					{previewUrl && (
					  <div
						className="modal-overlay"
						onClick={() => setPreviewUrl(null)}
						role="dialog"
						aria-modal="true"
					  >
						<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						  <button
							className="modal-close"
							onClick={() => setPreviewUrl(null)}
							aria-label="Close"
							type="button"
						  >
							✕
						  </button>
						  <img className="modal-image" src={previewUrl} alt="Full size cap" />
						</div>
					  </div>
					)}
				  


				  <table className="table" style={{ marginTop: 10 }}>
					<thead>
					  <tr>
						<th>ID</th>
						<th>Issued year</th>
						<th>Entry date</th>
						<th>Source</th>
						<th>Tags</th>
					  </tr>
					</thead>
					<tbody>
					  <tr>
						<td>{scanResult.cap.id}</td>
						<td>{scanResult.cap.issued_year ?? "-"}</td>
						<td>{scanResult.cap.entry_date ?? "-"}</td>
						<td>{scanResult.cap.caps_sources?.source_name ?? "-"}</td>
						<td>
						  {(scanResult.cap.beer_caps_tags?.map((x) => x.tags?.tag).filter(Boolean) ?? []).length ? (
							<span className="pill-wrap">
							  {(scanResult.cap.beer_caps_tags?.map((x) => x.tags?.tag).filter(Boolean) ?? []).map((t) => (
								<span key={t} className="pill">
								  {t}
								</span>
							  ))}
							</span>
						  ) : (
							<span className="muted">none</span>
						  )}
						</td>
					  </tr>
					</tbody>
				  </table>
				</>
			  ) : (
				<div className="help" style={{ marginTop: 10 }}>
				  This barcode is not assigned to any cap (free token).
				</div>
			  )}
			</div>
		  )}
		</div>


      <div className="audit-summary">
        <div className="stat-card">
          <div className="stat-label">Total caps</div>
          <div className="stat-value">{totalCaps}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Missing barcodes</div>
          <div className="stat-value">{missingCount}</div>
        </div>
		
		<div className="stat-card">
		  <div className="stat-label">Switch original</div>

		  <input
			className="input"
			value={switchBarcode}
			onChange={(e) => setSwitchBarcode(e.target.value)}
			placeholder="Scan 3-char barcode"
			maxLength={3}
			style={{ marginTop: 8 }}
			onKeyDown={(e) => {
			  if (e.key === "Enter") switchOriginalFlow();
			}}
			disabled={switchBusy}
		  />

		  <button
			className="button"
			type="button"
			onClick={switchOriginalFlow}
			disabled={!isSwitchValid || switchBusy}
			style={{ marginTop: 8, width: "100%" }}
		  >
			{switchBusy ? "Checking..." : "Switch"}
		  </button>

		  <div className="help" style={{ marginTop: 6 }}>
			Scan barcode to update it to original.
		  </div>

		  {switchMsg && (
			<div className="help" style={{ marginTop: 6, color: switchMsg.toLowerCase().includes("switched") ? "green" : "crimson" }}>
			  {switchMsg}
			</div>
		  )}
		</div>
		
      </div>

		<div
		  style={{
			margin: "24px 0",
			borderTop: "1px solid #e5e7eb",
		  }}
		/>

      <div className="form">
        <div className="field">
          <label>Caps missing barcodes</label>

          <div className="actions" style={{ alignItems: "center" }}>
            <span className="pager-label">Show</span>
            <select
              className="pager-select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) as 10 | 50 | 100)}
              disabled={isBusy}
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
                    <button
                      className="button"
                      type="button"
                      onClick={() => generateFor(c.id)}
                      disabled={isBusy}
                    >
                      {isBusy ? "Working..." : "Generate"}
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

          {msg && (
            <div className="help" style={{ color: "crimson", marginTop: 8 }}>
              {msg}
            </div>
          )}
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
              disabled={isBusy}
            />

            <input
              className="input"
              value={copySheet}
              onChange={(e) => setCopySheet(e.target.value)}
              placeholder="Sheet (e.g. GER-13)"
              maxLength={10}
              disabled={isBusy}
            />

            <button
              className="button"
              type="button"
              onClick={() => generateFor(capIdNumber, copySheet)}
              disabled={isBusy || !Number.isInteger(capIdNumber) || capIdNumber < 1}
            >
              {isBusy ? "Working..." : "Generate"}
            </button>
          </div>

          <div className="help">For copies, enter the sheet where this duplicate is stored.</div>
        </div>
      </div>

      {/* Hidden canvas used for PDF generation */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </>
  );
}
