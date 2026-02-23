"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";
import { supabase } from "@/lib/supabaseClient";

type LookupBarcodeRow = {
  id: number; // from beer_caps_barcodes
  barcode: string;
  beer_cap_id: number | null;
  control_bar: number;
  reserved_trade_id: number | null;
  sheet: string | null; // token sheet
};

type TradeType =
  | "blind_trade"
  | "exotic_trade"
  | "scan_trade"
  | "blind_ro"
  | "scan_ro";

type CapDetails = {
  id: number;
  beer_name: string;
  cap_no: number;

  cap_country: number;
  country_name_full: string;
  country_name_abb: string;

  entry_date: string;
  issued_year: number | null;

  // NOTE: cap.sheet exists but in this module we edit barcodeRow.sheet
  sheet: string | null;

  trade_type: TradeType;

  source: number | null;
  source_name: string | null;
  source_country: number | null;

  photo_path: string | null;
};

type SourceRow = {
  id: number;
  source_name: string;
  source_country: number;
};

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
};

const TRADE_TYPE_OPTIONS: TradeType[] = [
  "blind_trade",
  "exotic_trade",
  "scan_trade",
  "blind_ro",
  "scan_ro",
];

function isTradeType(x: any): x is TradeType {
  return TRADE_TYPE_OPTIONS.includes(x);
}

function publicPhotoUrl(photo_path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${photo_path}`;
}

export default function EditCapPage() {
  const scanRef = useRef<HTMLInputElement | null>(null);

  const [savedOk, setSavedOk] = useState(false);

  // scan input
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<string>("");

  // loaded data
  const [barcodeRow, setBarcodeRow] = useState<LookupBarcodeRow | null>(null);
  const [cap, setCap] = useState<CapDetails | null>(null);

  // dropdown data
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);

  // form state (editable fields)
  const [beerName, setBeerName] = useState("");
  const [capNo, setCapNo] = useState<string>("");

  const [countryOpt, setCountryOpt] = useState<TypeaheadOption | null>(null);
  const capCountryId = countryOpt?.id ?? null;

  const [tradeType, setTradeType] = useState<TradeType>("blind_trade");

  // source uses TypeaheadSelect
  const [sourceOpt, setSourceOpt] = useState<TypeaheadOption | null>(null);

  const [issuedYear, setIssuedYear] = useState<string>("");

  // IMPORTANT: in this module, sheet is the TOKEN sheet (beer_caps_barcodes.sheet)
  const [tokenSheet, setTokenSheet] = useState<string>("");

  // photo modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // saving
  const [saving, setSaving] = useState(false);

  const photoExists = !!cap?.photo_path;

  // convenience
  const tokenIsOriginal = barcodeRow?.control_bar === 1;
  const tokenBlockedTrade = barcodeRow?.control_bar === 3;

  // autofocus scan input
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // load countries + sources (anon reads)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: cData, error: cErr } = await supabase
        .from("caps_country")
        .select("id,country_name_full,country_name_abb")
        .order("country_name_full", { ascending: true });

      if (!alive) return;
      if (cErr) {
        setStatus(`Failed to load countries: ${cErr.message}`);
      } else {
        setCountries(cData ?? []);
      }

      const { data: sData, error: sErr } = await supabase
        .from("caps_sources")
        .select("id,source_name,source_country")
        .order("source_name", { ascending: true });

      if (!alive) return;
      if (sErr) {
        setStatus((prev) => prev || `Failed to load sources: ${sErr.message}`);
      } else {
        setSources(sData ?? []);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const countryIdToAbb = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of countries) m.set(c.id, c.country_name_abb);
    return m;
  }, [countries]);

  const countryOptions: TypeaheadOption[] = useMemo(() => {
    return countries.map((c) => ({
      id: c.id,
      label: c.country_name_full,
      meta: c.country_name_abb,
    }));
  }, [countries]);

  // Source options (NOT filtered by country). Always include current sourceOpt if set.
  const sourceOptions: TypeaheadOption[] = useMemo(() => {
    const opts = sources.map((s) => ({
      id: s.id,
      label: s.source_name,
      meta: countryIdToAbb.get(s.source_country) ?? String(s.source_country),
    }));

    if (sourceOpt && sourceOpt.id > 0 && !opts.some((o) => o.id === sourceOpt.id)) {
      opts.unshift(sourceOpt);
    }

    return opts;
  }, [sources, countryIdToAbb, sourceOpt]);

  function fillFormFromCap(next: CapDetails, br: LookupBarcodeRow | null) {
    setBeerName(next.beer_name);
    setCapNo(String(next.cap_no));

    setCountryOpt({
      id: next.cap_country,
      label: next.country_name_full,
      meta: next.country_name_abb,
    });

    const tt = String((next as any).trade_type ?? "").trim();
    setTradeType(isTradeType(tt) ? tt : "blind_trade");

    if (next.source) {
      setSourceOpt({
        id: next.source,
        label: next.source_name ?? `Source #${next.source}`,
        meta:
          (next.source_country &&
            (countryIdToAbb.get(next.source_country) ?? String(next.source_country))) ||
          undefined,
      });
    } else {
      setSourceOpt(null);
    }

    setIssuedYear(next.issued_year ? String(next.issued_year) : "");

    // token sheet comes from barcode row
    setTokenSheet(br?.sheet ?? "");
  }

  function resetAll() {
    setBarcodeRow(null);
    setCap(null);
    setStatus("");
    setBeerName("");
    setCapNo("");
    setCountryOpt(null);
    setTradeType("blind_trade");
    setSourceOpt(null);
    setIssuedYear("");
    setTokenSheet("");
    setBarcode("");
    setSavedOk(false);
    scanRef.current?.focus();
  }

  async function lookupByBarcode(b: string) {
    const bNorm = b.trim();
    if (!/^[A-Za-z0-9]{3}$/.test(bNorm)) {
      setStatus("Invalid barcode format (expected 3 alphanumeric chars).");
      return;
    }

    setStatus("Searching…");
    setBarcodeRow(null);
    setCap(null);

    const res = await fetch(
      `/api/admin/edit-cap/lookup?barcode=${encodeURIComponent(bNorm)}`,
      { method: "GET" }
    );

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setStatus(json?.error ?? "Lookup failed");
      return;
    }

    const br = (json?.barcodeRow ?? null) as LookupBarcodeRow | null;
    const c = (json?.cap ?? null) as CapDetails | null;

    setBarcodeRow(br);

    // BLOCK: involved in trade (control_bar=3)
    if (json?.blocked === true || (br && Number(br.control_bar) === 3)) {
      setCap(null);
      setSavedOk(false);

      const tradeId = br?.reserved_trade_id ?? null;
      setStatus(
        tradeId
          ? `Cap involved in active trade (control_bar=3). Editing is disabled to protect trade integrity. Trade ID: ${tradeId}.`
          : "Cap involved in active trade (control_bar=3). Editing is disabled to protect trade integrity."
      );
      return;
    }

    setCap(c);

    if (!br) {
      setStatus("Barcode not found.");
      return;
    }

    if (!br.beer_cap_id) {
      setStatus(
        "Free barcode token (control_bar=0). This barcode is not assigned to any cap. Nothing to edit here. Use Manage barcodes to assign it."
      );
      return;
    }

    if (!c) {
      setStatus("Cap not found for this barcode.");
      return;
    }

    fillFormFromCap(c, br);
    setStatus(`Loaded cap #${c.id}.`);
  }

  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    await lookupByBarcode(barcode);
    setBarcode("");
    scanRef.current?.focus();
  }

  async function onSave() {
    if (!cap) {
      setStatus("No cap loaded.");
      return;
    }
    if (!barcodeRow) {
      setStatus("No barcode loaded.");
      return;
    }
    if (barcodeRow.control_bar === 3) {
      setStatus("Cap involved in trade (control_bar=3). Not editable in this module.");
      return;
    }
    if (!beerName.trim()) {
      setStatus("Beer name is required.");
      return;
    }
    const capNoInt = Number(capNo);
    if (!Number.isInteger(capNoInt) || capNoInt <= 0) {
      setStatus("Cap number must be a positive integer.");
      return;
    }
    if (!capCountryId) {
      setStatus("Country is required.");
      return;
    }

    const tradeTypeNorm = String(tradeType ?? "").trim();
    if (!isTradeType(tradeTypeNorm)) {
      setStatus(`Invalid trade type: "${tradeType}"`);
      return;
    }

    const issued =
      issuedYear.trim() === "" ? null : Number.parseInt(issuedYear.trim(), 10);
    if (issuedYear.trim() !== "" && !Number.isInteger(issued)) {
      setStatus("Issued year must be an integer.");
      return;
    }

    const payload = {
      barcode: barcodeRow.barcode, // required by update route

      // cap patch:
      id: cap.id,
      beer_name: beerName.trim(),
      cap_no: capNoInt,
      cap_country: capCountryId,
      trade_type: tradeTypeNorm,
      source: sourceOpt?.id && sourceOpt.id > 0 ? sourceOpt.id : null,
      issued_year: issuedYear.trim() === "" ? null : issued,

      // token sheet (beer_caps_barcodes.sheet)
      sheet: tokenSheet.trim() === "" ? null : tokenSheet.trim(),
    };

    setSaving(true);
    setStatus("Saving…");

    const res = await fetch("/api/admin/edit-cap/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    setSaving(false);

    if (!res.ok) {
      setStatus(json?.error ?? "Save failed");
      return;
    }

    // reload by barcode (keeps token sheet correct)
    const reload = await fetch(
      `/api/admin/edit-cap/lookup?barcode=${encodeURIComponent(barcodeRow.barcode)}`
    );
    const reloadJson = await reload.json().catch(() => null);
    if (reload.ok && reloadJson?.cap) {
      const newCap = reloadJson.cap as CapDetails;
      const newBr = (reloadJson.barcodeRow ?? null) as LookupBarcodeRow | null;
      setCap(newCap);
      setBarcodeRow(newBr);
      fillFormFromCap(newCap, newBr);
    }

    setStatus("Saved ✅");
    setSavedOk(true);
  }

  // close modals on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewUrl) setPreviewUrl(null);
      if (savedOk) {
        setSavedOk(false);
        scanRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewUrl, savedOk]);

  const headerTitle = cap
    ? `${cap.beer_name} – ${cap.cap_no} – ${cap.country_name_abb}`
    : "Edit beer caps";

  return (
    <div className="page">
      <h1 className="h1-display">✏️ {headerTitle}</h1>

      {/* Scan */}
      <form onSubmit={onScanSubmit} className="panel" style={{ marginBottom: 12 }}>
        <div className="row2" style={{ gridTemplateColumns: "160px 1fr" }}>
          <div className="field">
            <label>Scan barcode</label>
            <input
              ref={scanRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="A0b"
              className="input"
              style={{ width: 180 }}
              inputMode="text"
              autoComplete="off"
            />
          </div>

          <div className="actions" style={{ alignSelf: "end", justifyContent: "flex-start" }}>
            <button className="button" type="submit">
              Find
            </button>
            {(cap || barcodeRow) && (
              <button className="button" type="button" onClick={resetAll}>
                Reset
              </button>
            )}
          </div>
        </div>

        {status && <div className="help">{status}</div>}
      </form>

      {/* Barcode info */}
      {barcodeRow && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div className="label">Scanned barcode</div>
              <div style={{ fontWeight: 900 }}>{barcodeRow.barcode}</div>
              <div className="help">
                Token ID <b>{barcodeRow.id}</b> • control_bar <b>{barcodeRow.control_bar}</b>
                {tokenBlockedTrade && (
                  <>
                    {" "}
                    • <b className="locked-text">LOCKED</b>
                  </>
                )}
              </div>
            </div>

            <div title="Not editable in this module" style={{ opacity: 0.6 }}>
              <div className="label">Reserved trade ID</div>
              <div style={{ fontWeight: 900 }}>{barcodeRow.reserved_trade_id ?? "—"}</div>
            </div>

            <div className="actions">
              <Link className="button" href="/admin/manage-barcodes">
                Manage barcodes
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Edit UI (guarded) */}
      {cap && !tokenBlockedTrade && (
        <div className="editcap-grid">
          {/* Form */}
          <div className="panel">
            <div className="help" style={{ marginBottom: 10 }}>
              ID <b>{cap.id}</b> • Entry date <b>{cap.entry_date}</b>
            </div>

            <div className="form" style={{ maxWidth: "none" }}>
              <div className="editcap-rows">
                {/* Row 1: Beer + Trade */}
                <div className="field">
                  <label>
                    Beer name{" "}
                    {photoExists && (
                      <span className="locked-text" style={{ marginLeft: 6 }}>
                        (locked — photo exists)
                      </span>
                    )}
                  </label>

                  <input
                    className="input"
                    value={beerName}
                    onChange={(e) => setBeerName(e.target.value)}
                    disabled={photoExists}
                  />

                  {photoExists && (
                    <div className="help">Beer name cannot be changed while a photo exists.</div>
                  )}
                </div>

                <div className="field">
                  <label>Trade type</label>
                  <select
                    className="select"
                    value={tradeType}
                    onChange={(e) => setTradeType(String(e.target.value).trim() as TradeType)}
                  >
                    {TRADE_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 2: Country + Issued */}
                <div className="field">
                  <label>
                    Country{" "}
                    {photoExists && (
                      <span className="locked-text" style={{ marginLeft: 6 }}>
                        (locked — photo exists)
                      </span>
                    )}
                  </label>

                  <div
                    style={{
                      opacity: photoExists ? 0.6 : 1,
                      pointerEvents: photoExists ? ("none" as const) : "auto",
                    }}
                  >
                    <TypeaheadSelect
                      options={countryOptions}
                      value={countryOpt}
                      onChange={setCountryOpt}
                      placeholder="Type 2+ chars…"
                      minChars={2}
                      maxResults={12}
                      inputClassName="th-input"
                      allowCreate={false}
                    />
                  </div>

                  {photoExists && (
                    <div className="help">Country cannot be changed while a photo exists.</div>
                  )}
                </div>

                <div className="field">
                  <label>Issued year</label>
                  <input
                    className="input"
                    value={issuedYear}
                    onChange={(e) => setIssuedYear(e.target.value)}
                    inputMode="numeric"
                    placeholder="(optional)"
                  />
                </div>

                {/* Row 3: Cap no + Source */}
                <div className="field">
                  <label>
                    Cap no{" "}
                    {photoExists && (
                      <span className="locked-text" style={{ marginLeft: 6 }}>
                        (locked — photo exists)
                      </span>
                    )}
                  </label>
                  <input
                    className="input"
                    value={capNo}
                    onChange={(e) => setCapNo(e.target.value)}
                    inputMode="numeric"
                    disabled={photoExists}
                  />
                  {photoExists && (
                    <div className="help">Cap number cannot be changed while a photo exists.</div>
                  )}
                </div>

                <div className="field">
                  <label>Source</label>

                  <TypeaheadSelect
                    options={sourceOptions}
                    value={sourceOpt}
                    onChange={setSourceOpt}
                    placeholder="Type 2+ chars…"
                    minChars={2}
                    maxResults={12}
                    inputClassName="th-input"
                    allowCreate={false}
                  />

                  <div className="help">Clear to set “None”.</div>
                </div>

                {/* Row 4: empty + Sheet */}
                <div className="editcap-row-empty" />

                <div className="field">
                  <label>
                    Sheet{" "}
                    {tokenIsOriginal && (
                      <span className="help" style={{ marginLeft: 6 }}>
                        (original token → also updates cap sheet)
                      </span>
                    )}
                  </label>
                  <input
                    className="input"
                    value={tokenSheet}
                    onChange={(e) => setTokenSheet(e.target.value)}
                    placeholder="(optional)"
                  />
                  <div className="help">
                    This edits the scanned barcode token sheet.
                    {tokenIsOriginal ? " Since control_bar=1, it also syncs the cap sheet." : ""}
                  </div>
                </div>

                {/* Row 5: Save */}
                <div className="actions" style={{ gridColumn: "1 / -1" }}>
                  <button className="button" type="button" disabled={saving} onClick={onSave}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Photo */}
          <div className="panel">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <h3 style={{ margin: 0 }}>Photo</h3>
              <Link className="button" href="/admin/photo-audit">
                Photo audit
              </Link>
            </div>

            <div style={{ marginTop: 12 }}>
              {cap.photo_path ? (
                <img
                  className="thumb"
                  src={publicPhotoUrl(cap.photo_path)}
                  alt="cap"
                  style={{ cursor: "zoom-in" }}
                  onClick={() => setPreviewUrl(publicPhotoUrl(cap.photo_path!))}
                />
              ) : (
                <div className="thumb-placeholder">No photo</div>
              )}
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              {!cap.photo_path && (
                <Link className="button" href="/admin/upload-photo">
                  Upload photo
                </Link>
              )}
            </div>

            <div className="help" style={{ marginTop: 10 }}>
              Photo is not editable here.
            </div>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {savedOk && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSavedOk(false);
            scanRef.current?.focus();
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setSavedOk(false);
                scanRef.current?.focus();
              }}
            >
              ✕
            </button>

            <div style={{ padding: 18, color: "#fff" }}>
              <h3 style={{ margin: 0 }}>Saved ✅</h3>
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                Changes were saved for cap ID <b>{cap?.id}</b>.
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setSavedOk(false);
                    scanRef.current?.focus();
                  }}
                >
                  OK
                </button>

                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setSavedOk(false);
                    resetAll();
                  }}
                >
                  Scan next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {previewUrl && (
        <div className="modal-overlay" onClick={() => setPreviewUrl(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewUrl(null)}>
              ✕
            </button>
            <img className="modal-image" src={previewUrl} alt="preview" />
          </div>
        </div>
      )}
    </div>
  );
}