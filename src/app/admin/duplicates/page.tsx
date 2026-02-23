// app/admin/duplicates/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DuplicateCapRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;

  photo_caps: { photo_path: string } | null;
  caps_country: { country_name_full: string } | null;

  entry_date?: string | null;

  duplicate_count: number;
};

type BarcodeRow = {
  barcode: string;
  control_bar: number;
  sheet: string | null;
};

export default function DuplicatesPage() {
  /* =========================
     Sort
  ========================= */
  const [sort, setSort] = useState<
    | "id_desc"
    | "beer_name_asc"
    | "beer_name_desc"
    | "country_asc"
    | "country_desc"
    | "sheet_asc"
    | "sheet_desc"
    | "duplicate_count_asc"
    | "duplicate_count_desc"
  >("id_desc");

  const toggleSort = (col: "beer" | "country" | "sheet" | "dupes") => {
    setPage(1);
    setSort((prev) => {
      if (col === "beer") {
        if (prev === "beer_name_asc") return "beer_name_desc";
        if (prev === "beer_name_desc") return "id_desc";
        return "beer_name_asc";
      }
      if (col === "country") {
        if (prev === "country_asc") return "country_desc";
        if (prev === "country_desc") return "id_desc";
        return "country_asc";
      }
      if (col === "sheet") {
        if (prev === "sheet_asc") return "sheet_desc";
        if (prev === "sheet_desc") return "id_desc";
        return "sheet_asc";
      }
      // dupes
      if (prev === "duplicate_count_asc") return "duplicate_count_desc";
      if (prev === "duplicate_count_desc") return "id_desc";
      return "duplicate_count_asc";
    });
  };

  const sortIcon = (col: "beer" | "country" | "sheet" | "dupes") => {
    if (col === "beer") return sort === "beer_name_asc" ? "▲" : sort === "beer_name_desc" ? "▼" : "";
    if (col === "country") return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
    if (col === "sheet") return sort === "sheet_asc" ? "▲" : sort === "sheet_desc" ? "▼" : "";
    return sort === "duplicate_count_asc" ? "▲" : sort === "duplicate_count_desc" ? "▼" : "";
  };

  const clearAll = () => {
    setBeerFilter("");
    setCountryFilter("");
    setSheetFilter("");
    setSort("id_desc");
    setPage(1);
  };

  /* =========================
     Filters
  ========================= */
  const [beerFilter, setBeerFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");

  const [beerQ, setBeerQ] = useState("");
  const [countryQ, setCountryQ] = useState("");
  const [sheetQ, setSheetQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      const b = beerFilter.trim();
      const c = countryFilter.trim();
      const s = sheetFilter.trim();

      setBeerQ(b.length >= 3 ? b : "");
      setCountryQ(c.length >= 2 ? c : "");
      setSheetQ(s.length >= 3 ? s : "");

      setPage(1);
    }, 250);

    return () => window.clearTimeout(t);
  }, [beerFilter, countryFilter, sheetFilter]);

  /* =========================
     Pagination
  ========================= */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  /* =========================
     Data
  ========================= */
  const [caps, setCaps] = useState<DuplicateCapRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Photo preview modal
  ========================= */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* =========================
     Expand + barcode cache
  ========================= */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [barcodeByCapId, setBarcodeByCapId] = useState<Record<number, BarcodeRow[]>>({});
  const [barcodeLoadingIds, setBarcodeLoadingIds] = useState<Set<number>>(new Set());

  const toggleExpanded = async (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // load on demand (cache)
    if (barcodeByCapId[id]) return;

    setBarcodeLoadingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/duplicates/barcodes?id=${id}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        console.error("Barcodes API error:", json?.error);
        setBarcodeByCapId((prev) => ({ ...prev, [id]: [] }));
      } else {
        setBarcodeByCapId((prev) => ({ ...prev, [id]: (json?.data || []) as BarcodeRow[] }));
      }
    } catch (e) {
      console.error("Barcodes network error:", e);
      setBarcodeByCapId((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setBarcodeLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  /* =========================
     Copy feedback state
  ========================= */
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const idCopyTimerRef = useRef<number | null>(null);
  const barcodeCopyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (idCopyTimerRef.current) window.clearTimeout(idCopyTimerRef.current);
      if (barcodeCopyTimerRef.current) window.clearTimeout(barcodeCopyTimerRef.current);
    };
  }, []);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const onCopyId = async (id: number) => {
    try {
      await copyText(String(id));
      setCopiedId(id);
      if (idCopyTimerRef.current) window.clearTimeout(idCopyTimerRef.current);
      idCopyTimerRef.current = window.setTimeout(() => setCopiedId(null), 900);
    } catch (e) {
      console.error("Copy ID failed:", e);
    }
  };

  const onCopyBarcode = async (barcode: string) => {
    try {
      await copyText(barcode);
      setCopiedBarcode(barcode);
      if (barcodeCopyTimerRef.current) window.clearTimeout(barcodeCopyTimerRef.current);
      barcodeCopyTimerRef.current = window.setTimeout(() => setCopiedBarcode(null), 900);
    } catch (e) {
      console.error("Copy barcode failed:", e);
    }
  };

  /* =========================
     Fetch main page
  ========================= */
  useEffect(() => {
    const fetchDuplicates = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        params.set("sort", sort);
        if (beerQ) params.set("beer", beerQ);
        if (countryQ) params.set("country", countryQ);
        if (sheetQ) params.set("sheet", sheetQ);

        const res = await fetch(`/api/duplicates?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          console.error("API error:", json?.error);
          setCaps([]);
          setTotal(0);
        } else {
          setCaps((json?.data || []) as DuplicateCapRow[]);
          setTotal(Number(json?.total || 0));
        }
      } catch (e) {
        console.error("Network error:", e);
        setCaps([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setExpandedIds(new Set());
      }
    };

    fetchDuplicates();
  }, [page, limit, sort, beerQ, countryQ, sheetQ]);

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Duplicates</h1>

      <div className="pager">
        <div className="filters-bar">
          <div className="filters-active">
            {beerQ || countryQ || sheetQ ? (
              <>
                <span className="muted">Active filters:</span>
                {beerQ && <span className="chip">Beer: {beerQ}</span>}
                {countryQ && <span className="chip">Country: {countryQ}</span>}
                {sheetQ && <span className="chip">Sheet: {sheetQ}</span>}
              </>
            ) : (
              <span className="muted">No filters</span>
            )}
          </div>

          <button
            className="linklike"
            type="button"
            onClick={clearAll}
            disabled={!beerFilter && !countryFilter && !sheetFilter && sort === "id_desc"}
          >
            Clear all
          </button>
        </div>

        <div className="pager-left">
          <label className="pager-label">
            Items per page:&nbsp;
            <select
              className="pager-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value) as 10 | 50 | 100);
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <span className="pager-info">
            Total: <b>{total}</b>
          </span>
        </div>

        <div className="pager-right">
          <button className="button" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Prev
          </button>

          <span className="pager-info">
            Page <b>{page}</b> / <b>{totalPages}</b>
          </span>

          <button className="button" type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            {/* A */}
            <th></th>

            {/* B */}
            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("beer")}>
                  Beer name <span className="th-icon">{sortIcon("beer")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={beerFilter}
                    onChange={(e) => setBeerFilter(e.target.value)}
                    placeholder="filter (min 3)…"
                  />
                  {beerFilter && (
                    <button className="th-clear" type="button" onClick={() => setBeerFilter("")} aria-label="Clear beer filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            {/* C */}
            <th>Cap no</th>

            {/* D */}
            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("country")}>
                  Country <span className="th-icon">{sortIcon("country")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    placeholder="filter (min 2)…"
                  />
                  {countryFilter && (
                    <button
                      className="th-clear"
                      type="button"
                      onClick={() => setCountryFilter("")}
                      aria-label="Clear country filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            {/* E */}
            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("sheet")}>
                  Sheet <span className="th-icon">{sortIcon("sheet")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={sheetFilter}
                    onChange={(e) => setSheetFilter(e.target.value)}
                    placeholder="filter (min 3)…"
                  />
                  {sheetFilter && (
                    <button className="th-clear" type="button" onClick={() => setSheetFilter("")} aria-label="Clear sheet filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            {/* F */}
            <th>Photo</th>

            {/* G */}
            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("dupes")}>
                  Duplicates <span className="th-icon">{sortIcon("dupes")}</span>
                </button>
              </div>
            </th>

            {/* H */}
            <th>ID</th>
          </tr>
        </thead>

        <tbody>
          {caps.map((cap) => {
            const isOpen = expandedIds.has(cap.id);
            const barcodes = barcodeByCapId[cap.id] || [];
            const isBarcodeLoading = barcodeLoadingIds.has(cap.id);

            return (
              <React.Fragment key={cap.id}>
                <tr>
                  {/* A: chevron only */}
                  <td className="chevron-cell">
                    <button
                      type="button"
                      className="chevron-btn"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(cap.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <span className={`chevron ${isOpen ? "open" : ""}`}>▶</span>
                    </button>
                  </td>

                  {/* B */}
                  <td>{cap.beer_name}</td>

                  {/* C */}
                  <td>{cap.cap_no}</td>

                  {/* D */}
                  <td>{cap.caps_country?.country_name_full ?? "-"}</td>

                  {/* E */}
                  <td>{cap.sheet ?? "-"}</td>

                  {/* F */}
                  <td>
                    {cap.photo_caps?.photo_path ? (
                      <img
                        className="thumb"
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${cap.photo_caps.photo_path}`}
                        alt="cap"
                        style={{ cursor: "zoom-in" }}
                        onClick={() =>
                          setPreviewUrl(
                            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${cap.photo_caps!.photo_path}`
                          )
                        }
                      />
                    ) : (
                      <div className="thumb-placeholder">No photo</div>
                    )}
                  </td>

                  {/* G */}
                  <td>{cap.duplicate_count ?? 0}</td>

                  {/* H */}
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{cap.id}</span>
                      <button
                        className="button"
                        type="button"
                        onClick={() => onCopyId(cap.id)}
                        style={{ padding: "6px 10px" }}
                      >
                        {copiedId === cap.id ? "Copied" : "Copy ID"}
                      </button>
                    </div>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="table-details-row">
                    <td colSpan={8}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div className="muted">
                          Barcodes for ID <b>{cap.id}</b> (original first, then duplicates)
                        </div>
                        {isBarcodeLoading && <div className="muted">Loading barcodes…</div>}
                      </div>

                      <div
                        className="barcode-grid"
                        style={{
                          marginTop: 12,
                          display: "grid",
                          gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {barcodes.map((b) => {
                          const isOriginal = b.control_bar === 1;
                          return (
							<div
							  key={b.barcode}
							  className="barcode-card"
							  style={{
								border: "1px solid rgba(255,255,255,0.08)",
								borderRadius: 10,
								padding: 10,
								display: "flex",
								flexDirection: "column",
								gap: 8,
								minHeight: 70,
							  }}
							>
							  <div style={{ fontWeight: 700, fontSize: 13 }}>
								{b.barcode}
								{isOriginal ? <span className="muted"> (orig)</span> : null}
							  </div>

							  <button
								className="button"
								type="button"
								onClick={() => onCopyBarcode(b.barcode)}
								style={{ padding: "6px 10px" }}
							  >
								{copiedBarcode === b.barcode ? "Copied" : "Copy barcode"}
							  </button>

							  <div className="muted" style={{ fontSize: 12 }}>
								{b.sheet ?? "-"}
							  </div>
							</div>
                          );
                        })}
                      </div>

                      {!isBarcodeLoading && barcodes.length === 0 && (
                        <div style={{ marginTop: 12 }} className="muted">
                          No barcodes found.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {previewUrl && (
        <div className="modal-overlay" onClick={() => setPreviewUrl(null)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewUrl(null)} aria-label="Close">
              ✕
            </button>
            <img className="modal-image" src={previewUrl} alt="Full size cap" />
          </div>
        </div>
      )}
    </main>
  );
}