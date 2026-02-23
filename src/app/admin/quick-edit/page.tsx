"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type TradeTypeEnum =
  | "blind_trade"
  | "exotic_trade"
  | "scan_trade"
  | "blind_ro"
  | "scan_ro";

const TRADE_TYPES: Array<{ value: TradeTypeEnum; label: string }> = [
  { value: "blind_trade", label: "Blind trade" },
  { value: "exotic_trade", label: "Exotic trade" },
  { value: "scan_trade", label: "Scan trade" },
  { value: "blind_ro", label: "Blind RO" },
  { value: "scan_ro", label: "Scan RO" },
];

type LookupCap = {
  id: number;
  entry_date: string;
  beer_name: string;
  cap_no: number;
  trade_type: TradeTypeEnum;
  cap_country: number;
  country_name_full: string;
  source: number | null;
  source_name: string | null;
  sheet: string | null;
  issued_year: number | null;

  has_photo: boolean;
  has_barcode: boolean;
  in_trade: boolean;

  tags: Array<{
    tag_id: number;
    tag: string;
    type: string;
    auto_generated: boolean;
  }>;
};

function toInt(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function QuickEditPage() {
  const [countries, setCountries] = useState<TypeaheadOption[]>([]);
  const [sources, setSources] = useState<TypeaheadOption[]>([]);

  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  // EDIT
  const [editId, setEditId] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editCap, setEditCap] = useState<LookupCap | null>(null);

  // editable fields
  const [beerName, setBeerName] = useState("");
  const [capNo, setCapNo] = useState("");
  const [tradeType, setTradeType] = useState<TradeTypeEnum>("scan_trade");
  const [countryOpt, setCountryOpt] = useState<TypeaheadOption | null>(null);
  const [sourceOpt, setSourceOpt] = useState<TypeaheadOption | null>(null);
  const [sheet, setSheet] = useState("");
  const [issuedYear, setIssuedYear] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // DELETE
  const [delId, setDelId] = useState("");
  const [delLoading, setDelLoading] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delCap, setDelCap] = useState<LookupCap | null>(null);
  const [delLoading2, setDelLoading2] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);

  /* =========================
     Load meta (countries/sources)
  ========================= */
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        setMetaLoading(true);
        setMetaErr(null);
        const res = await fetch("/api/admin/quick-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "meta" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load meta");
        if (!alive) return;
        setCountries(json?.countries ?? []);
        setSources(json?.sources ?? []);
      } catch (e: any) {
        if (!alive) return;
        setMetaErr(e?.message ?? "Failed to load meta");
      } finally {
        if (!alive) return;
        setMetaLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, []);

  const editGate = useMemo(() => {
    if (!editCap) return null;
    return {
      hasPhoto: !!editCap.has_photo,
      hasBarcode: !!editCap.has_barcode,
      eligible: !editCap.has_photo && !editCap.has_barcode,
      inTrade: !!editCap.in_trade,
    };
  }, [editCap]);

  const delGate = useMemo(() => {
    if (!delCap) return null;
    return {
      hasPhoto: !!delCap.has_photo,
      hasBarcode: !!delCap.has_barcode,
      eligible: !delCap.has_photo && !delCap.has_barcode,
      inTrade: !!delCap.in_trade,
      tagsCount: (delCap.tags ?? []).length,
    };
  }, [delCap]);

  function resetEdit() {
    setEditId("");
    setEditErr(null);
    setEditCap(null);
    setSaveMsg(null);

    setBeerName("");
    setCapNo("");
    setTradeType("scan_trade");
    setCountryOpt(null);
    setSourceOpt(null);
    setSheet("");
    setIssuedYear("");
  }

  function resetDelete() {
    setDelId("");
    setDelErr(null);
    setDelCap(null);
    setDelMsg(null);
  }

  async function findForEdit() {
    try {
      setEditLoading(true);
      setEditErr(null);
      setSaveMsg(null);
      setEditCap(null);

      const id = toInt(editId);
      if (!id) {
        setEditErr("Enter a valid cap id.");
        return;
      }

      const res = await fetch("/api/admin/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Find failed");

      const cap: LookupCap = json?.cap;
      setEditCap(cap);

      // Only preload editable fields if eligible
      const eligible = !cap.has_photo && !cap.has_barcode;
      if (eligible) {
        setBeerName(cap.beer_name ?? "");
        setCapNo(String(cap.cap_no ?? ""));
        setTradeType(cap.trade_type ?? "scan_trade");

        const cOpt = countries.find((c) => c.id === cap.cap_country) ?? null;
        setCountryOpt(cOpt);

        const sOpt =
          cap.source != null ? sources.find((s) => s.id === cap.source) ?? null : null;
        setSourceOpt(sOpt);

        setSheet(cap.sheet ?? "");
        setIssuedYear(cap.issued_year == null ? "" : String(cap.issued_year));
      }
    } catch (e: any) {
      setEditErr(e?.message ?? "Find failed");
    } finally {
      setEditLoading(false);
    }
  }

  async function saveEdit() {
    try {
      setSaveLoading(true);
      setSaveMsg(null);
      setEditErr(null);

      const cap = editCap;
      if (!cap) {
        setEditErr("Nothing loaded.");
        return;
      }
      if (cap.has_photo || cap.has_barcode) {
        setEditErr("Blocked: this cap has photo and/or barcode. Use the dedicated modules.");
        return;
      }

      const id = cap.id;
      const cap_no = toInt(capNo);
      const cap_country = countryOpt?.id ?? null;
      const source = sourceOpt?.id ?? null;

      if (!beerName.trim()) {
        setEditErr("Beer name is required.");
        return;
      }
      if (!cap_no || cap_no <= 0) {
        setEditErr("Cap no must be a positive integer.");
        return;
      }
      if (!cap_country) {
        setEditErr("Country is required.");
        return;
      }

      const issued_year = issuedYear.trim() ? toInt(issuedYear) : null;
      if (issuedYear.trim() && issued_year == null) {
        setEditErr("Issued year must be a number (or empty).");
        return;
      }

      const res = await fetch("/api/admin/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id,
          beer_name: beerName,
          cap_no,
          trade_type: tradeType,
          cap_country,
          source,
          sheet: sheet.trim() ? sheet.trim() : null,
          issued_year,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Update failed");

      setSaveMsg("Saved.");
      await findForEdit();
    } catch (e: any) {
      setEditErr(e?.message ?? "Update failed");
    } finally {
      setSaveLoading(false);
    }
  }

  async function findForDelete() {
    try {
      setDelLoading(true);
      setDelErr(null);
      setDelMsg(null);
      setDelCap(null);

      const id = toInt(delId);
      if (!id) {
        setDelErr("Enter a valid cap id.");
        return;
      }

      const res = await fetch("/api/admin/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Find failed");

      setDelCap(json?.cap as LookupCap);
    } catch (e: any) {
      setDelErr(e?.message ?? "Find failed");
    } finally {
      setDelLoading(false);
    }
  }

  async function doDelete() {
    try {
      setDelLoading2(true);
      setDelErr(null);
      setDelMsg(null);

      const cap = delCap;
      if (!cap) {
        setDelErr("Nothing loaded.");
        return;
      }
      if (cap.has_photo || cap.has_barcode) {
        setDelErr("Blocked: this cap has photo and/or barcode. Use the dedicated modules.");
        return;
      }

      const res = await fetch("/api/admin/quick-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: cap.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");

      setDelMsg("Deleted.");
      setDelCap(null);
      setDelId("");
    } catch (e: any) {
      setDelErr(e?.message ?? "Delete failed");
    } finally {
      setDelLoading2(false);
    }
  }

  return (
    <div>
      <h1>Quick edit/remove beer caps</h1>
      <p className="muted">
        This module only allows editing/deleting caps that have <b>no photo</b> and{" "}
        <b>no barcode</b>. For caps with photos or barcodes, use the dedicated modules.
      </p>

      {metaLoading && <p className="muted">Loading countries/sources…</p>}
      {metaErr && (
        <div className="card" style={{ borderColor: "crimson" }}>
          <b>Error:</b> {metaErr}
        </div>
      )}

      {/* Two-panel layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          marginTop: 12,
        }}
      >
		<style>{`
		  .qe-grid { grid-template-columns: 1fr; }
		  @media (min-width: 700px) {
			.qe-grid { grid-template-columns: 1fr 1fr; align-items: start; }
		  }
		`}</style>

		<div className="qe-grid" style={{ display: "grid", gap: 100 }}>
          {/* LEFT: EDIT */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Edit</h2>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ width: 140 }}
                placeholder="Cap ID"
                value={editId}
                onChange={(e) => setEditId(e.target.value)}
              />

              <button
                className="button"
                type="button"
                onClick={findForEdit}
                disabled={editLoading}
                style={{ padding: "6px 10px" }}
              >
                {editLoading ? "Finding..." : "Find"}
              </button>

              <button
                className="button"
                type="button"
                onClick={resetEdit}
                disabled={editLoading || saveLoading}
                style={{ padding: "6px 10px" }}
              >
                Reset
              </button>
            </div>

            {editErr && (
              <div className="card" style={{ marginTop: 10, borderColor: "crimson" }}>
                <b>Error:</b> {editErr}
              </div>
            )}

            {editCap && (
              <div className="card" style={{ marginTop: 10 }}>
                <div className="muted">
                  <div>
                    <b>ID:</b> {editCap.id} &nbsp; <b>Entry date:</b> {editCap.entry_date}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <b>Gate:</b>{" "}
                    {editGate?.eligible ? <span>✅ Eligible</span> : <span>❌ Blocked</span>}
                  </div>

                  {!editGate?.eligible && (
                    <div style={{ marginTop: 6 }}>
                      {editGate?.hasPhoto && (
                        <div>
                          • Has a photo — cap is not photo free.{" "}
                          <a href="/admin/photo-audit">Go to Photo audit</a>
                        </div>
                      )}
                      {editGate?.hasBarcode && (
                        <div>
                          • Has a barcode — cap is not barcode free.{" "}
                          <a href="/admin/manage-barcodes">Go to Manage barcodes</a>
                        </div>
                      )}
                    </div>
                  )}

                  {editGate?.eligible && editGate?.inTrade && (
                    <div style={{ marginTop: 6 }}>
                      • <b>Note:</b> This cap appears in <code>trade_caps</code>. Editing is
                      allowed here, but be careful if trade modules rely on these fields.
                    </div>
                  )}
                </div>

                {editGate?.eligible && (
                  <>
                    <hr style={{ margin: "12px 0" }} />

                    <div className="form-grid" style={{ display: "grid", gap: 10 }}>
                      <label>
                        <div className="muted">Beer name</div>
                        <input
                          className="input"
                          value={beerName}
                          onChange={(e) => setBeerName(e.target.value)}
                        />
                      </label>

                      <label>
                        <div className="muted">Cap no</div>
                        <input
                          className="input"
                          value={capNo}
                          onChange={(e) => setCapNo(e.target.value)}
                        />
                      </label>

                      <label>
                        <div className="muted">Trade type</div>
                        <select
                          className="input"
                          value={tradeType}
                          onChange={(e) => setTradeType(e.target.value as TradeTypeEnum)}
                        >
                          {TRADE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <div className="muted">Country</div>
                        <TypeaheadSelect
                          options={countries}
                          value={countryOpt}
                          onChange={setCountryOpt}
                          placeholder="Type country..."
                          inputClassName="input"
                        />
                      </label>

                      <label>
                        <div className="muted">Source</div>
                        <TypeaheadSelect
                          options={sources}
                          value={sourceOpt}
                          onChange={setSourceOpt}
                          placeholder="Type source..."
                          inputClassName="input"
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          (Optional)
                        </div>
                      </label>

                      <label>
                        <div className="muted">Sheet</div>
                        <input
                          className="input"
                          value={sheet}
                          onChange={(e) => setSheet(e.target.value)}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          (Optional)
                        </div>
                      </label>

                      <label>
                        <div className="muted">Issued year</div>
                        <input
                          className="input"
                          value={issuedYear}
                          onChange={(e) => setIssuedYear(e.target.value)}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          (Optional)
                        </div>
                      </label>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="button"
                        type="button"
                        onClick={saveEdit}
                        disabled={saveLoading}
                        style={{ padding: "6px 10px" }}
                      >
                        {saveLoading ? "Saving..." : "Save"}
                      </button>

                      {saveMsg && <span className="muted">{saveMsg}</span>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: DELETE */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Remove</h2>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ width: 140 }}
                placeholder="Cap ID"
                value={delId}
                onChange={(e) => setDelId(e.target.value)}
              />

              <button
                className="button"
                type="button"
                onClick={findForDelete}
                disabled={delLoading}
                style={{ padding: "6px 10px" }}
              >
                {delLoading ? "Finding..." : "Find"}
              </button>

              <button
                className="button"
                type="button"
                onClick={resetDelete}
                disabled={delLoading || delLoading2}
                style={{ padding: "6px 10px" }}
              >
                Reset
              </button>
            </div>

            {delErr && (
              <div className="card" style={{ marginTop: 10, borderColor: "crimson" }}>
                <b>Error:</b> {delErr}
              </div>
            )}

            {delMsg && (
              <div className="card" style={{ marginTop: 10, borderColor: "green" }}>
                {delMsg}
              </div>
            )}

            {delCap && (
              <div className="card" style={{ marginTop: 10 }}>
                <div className="muted">
                  <div>
                    <b>ID:</b> {delCap.id} &nbsp; <b>Entry date:</b> {delCap.entry_date}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <b>Beer:</b> {delCap.beer_name} &nbsp; <b>Cap no:</b> {delCap.cap_no}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <b>Country:</b> {delCap.country_name_full}
                    {delCap.source_name ? (
                      <>
                        {" "}
                        &nbsp; <b>Source:</b> {delCap.source_name}
                      </>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <b>Gate:</b>{" "}
                    {delGate?.eligible ? <span>✅ Eligible</span> : <span>❌ Blocked</span>}
                  </div>

                  {!delGate?.eligible && (
                    <div style={{ marginTop: 6 }}>
                      {delGate?.hasPhoto && (
                        <div>
                          • Has a photo — cap is not photo free.{" "}
                          <a href="/admin/photo-audit">Go to Photo audit</a>
                        </div>
                      )}
                      {delGate?.hasBarcode && (
                        <div>
                          • Has a barcode — cap is not barcode free.{" "}
                          <a href="/admin/manage-barcodes">Go to Manage barcodes</a>
                        </div>
                      )}
                    </div>
                  )}

                  {delGate?.eligible && delGate?.inTrade && (
                    <div style={{ marginTop: 6 }}>
                      • <b>Blocked:</b> This cap is referenced in <code>trade_caps</code>. Remove
                      it from the trade first.
                    </div>
                  )}
                </div>

                {delGate?.eligible && !delGate?.inTrade && (
                  <>
                    <hr style={{ margin: "12px 0" }} />

                    {(delCap.tags ?? []).length > 0 ? (
                      <div className="card" style={{ marginBottom: 10 }}>
                        <div>
                          This cap is marked for deletion. The following tags are assigned to this
                          cap. Deleting the cap will automatically unassign the tags first:
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {delCap.tags.map((t) => (
                            <span
                              key={t.tag_id}
                              className="muted"
                              style={{
                                border: "1px solid #ddd",
                                padding: "2px 8px",
                                borderRadius: 999,
                              }}
                              title={t.type + (t.auto_generated ? " (auto)" : " (manual)")}
                            >
                              {t.tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="muted" style={{ marginBottom: 10 }}>
                        No tags assigned.
                      </div>
                    )}

                    <button
                      className="button"
                      type="button"
                      onClick={doDelete}
                      disabled={delLoading2}
                      style={{ padding: "6px 10px" }}
                    >
                      {delLoading2 ? "Deleting..." : "Delete cap"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}