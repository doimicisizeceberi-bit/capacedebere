"use client";

import React, { useEffect, useMemo, useState } from "react";

type CapRow = {
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

  // doubles count
  avail: number;
};

const STAT_LIMITS = [10, 50, 100] as const;
type Limit = (typeof STAT_LIMITS)[number];

type SortKey =
  | "id_desc"
  | "beer_name_asc"
  | "beer_name_desc"
  | "country_asc"
  | "country_desc"
  | "sheet_asc"
  | "sheet_desc"
  | "avail_asc"
  | "avail_desc";

const ADMIN_TOKEN_STORAGE_KEY = "admin_export_token";

export default function TradeCapsPage() {
  /* =========================
     Sort
  ========================= */
  const [sort, setSort] = useState<SortKey>("avail_desc");

  const toggleSort = (col: "beer" | "country" | "sheet" | "avail") => {
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
      // avail
      if (prev === "avail_desc") return "avail_asc";
      if (prev === "avail_asc") return "id_desc";
      return "avail_desc";
    });
  };

  const sortIcon = (col: "beer" | "country" | "sheet" | "avail") => {
    if (col === "beer") return sort === "beer_name_asc" ? "▲" : sort === "beer_name_desc" ? "▼" : "";
    if (col === "country") return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
    if (col === "sheet") return sort === "sheet_asc" ? "▲" : sort === "sheet_desc" ? "▼" : "";
    return sort === "avail_asc" ? "▲" : sort === "avail_desc" ? "▼" : "";
  };

  /* =========================
     Filters (debounced)
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

  const clearAll = () => {
    setBeerFilter("");
    setCountryFilter("");
    setSheetFilter("");
    setSort("avail_desc");
    setPage(1);
  };

  /* =========================
     Paging
  ========================= */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<Limit>(10);
  const [total, setTotal] = useState(0);

  /* =========================
     Data
  ========================= */
  const [caps, setCaps] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // expand rows (optional details)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectedCount = selected.size;

  // rank map to keep “current list order” for generate
  const [rankById, setRankById] = useState<Record<number, number>>({});

  useEffect(() => {
    const fetchCaps = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        params.set("sort", sort);
        if (beerQ) params.set("beer", beerQ);
        if (countryQ) params.set("country", countryQ);
        if (sheetQ) params.set("sheet", sheetQ);

        const res = await fetch(`/api/trade-caps?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          console.error("API error:", json?.error);
          setCaps([]);
          setTotal(0);
        } else {
          const rows = (json.data || []) as CapRow[];
          setCaps(rows);
          setTotal(json.total || 0);

          // update rank map for current page order
          setRankById((prev) => {
            const next = { ...prev };
            rows.forEach((r, idx) => {
              next[r.id] = (page - 1) * limit + idx;
            });
            return next;
          });
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

    fetchCaps();
  }, [page, limit, sort, beerQ, countryQ, sheetQ]);

  // ESC closes preview modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      caps.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const orderedSelectedIds = useMemo(() => {
    const ids = Array.from(selected);
    // sort by current known rank; unknown ranks go last in stable-ish order
    return ids.sort((a, b) => {
      const ra = rankById[a];
      const rb = rankById[b];
      const aKnown = Number.isFinite(ra);
      const bKnown = Number.isFinite(rb);
      if (aKnown && bKnown) return ra - rb;
      if (aKnown) return -1;
      if (bKnown) return 1;
      return a - b;
    });
  }, [selected, rankById]);

  async function generatePdf() {
    if (orderedSelectedIds.length === 0) {
      alert("Select at least one cap to include in the PDF.");
      return;
    }

    const tryOnce = async (token: string | null) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-admin-token"] = token;

      const res = await fetch("/api/admin/trade-caps/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: orderedSelectedIds }),
      });

      if (res.status === 401) return { ok: false as const, unauthorized: true as const, res };
      if (!res.ok) return { ok: false as const, unauthorized: false as const, res };

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return { ok: true as const };
    };

    // 1) try with stored token
    const stored = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    let out = await tryOnce(stored);

    // 2) if unauthorized, prompt and retry
    if (!out.ok && out.unauthorized) {
      const token = window.prompt("Admin token required to generate PDF:", stored ?? "");
      if (!token) return;

      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      out = await tryOnce(token);
    }

    if (!out.ok && !out.unauthorized) {
      const txt = await out.res.text().catch(() => "");
      console.error("PDF generate failed:", out.res.status, txt);
      alert(`PDF generation failed (${out.res.status}). Check console for details.`);
    }
  }

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Generate Trade Offer</h1>

      <div className="pager">
        <div className="filters-bar">
          <div className="filters-active">
            {(beerQ || countryQ || sheetQ) ? (
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
            disabled={!beerFilter && !countryFilter && !sheetFilter && sort === "avail_desc"}
          >
            Clear all
          </button>
        </div>

        <div className="pager-left" style={{ gap: 12 }}>
          <label className="pager-label">
            Items per page:&nbsp;
            <select
              className="pager-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value) as Limit);
                setPage(1);
              }}
            >
              {STAT_LIMITS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <span className="pager-info">
            Total: <b>{total}</b>
          </span>

          <span className="pager-info">
            Selected: <b>{selectedCount}</b>
          </span>

          <button className="button" type="button" onClick={selectAllOnPage} disabled={!caps.length}>
            Select page
          </button>

          <button className="button" type="button" onClick={clearSelection} disabled={!selectedCount}>
            Clear selection
          </button>

          <button className="button" type="button" onClick={generatePdf} disabled={!selectedCount}>
            Generate PDF
          </button>
        </div>

        <div className="pager-right">
          <button
            className="button"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>

          <span className="pager-info">
            Page <b>{page}</b> / <b>{pageCount}</b>
          </span>

          <button
            className="button"
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 46 }}>Pick</th>

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

            <th>Cap no</th>

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
                    <button className="th-clear" type="button" onClick={() => setCountryFilter("")} aria-label="Clear country filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

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

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("avail")}>
                  Avail <span className="th-icon">{sortIcon("avail")}</span>
                </button>
              </div>
            </th>

            <th>Photo</th>
          </tr>
        </thead>

        <tbody>
          {caps.map((cap) => {
            const isOpen = expandedIds.has(cap.id);
            const isPicked = selected.has(cap.id);

            const tagList =
              cap.beer_caps_tags?.map((x) => x.tags?.tag).filter(Boolean) ?? [];

            return (
              <React.Fragment key={cap.id}>
                <tr
                  className="table-row-clickable"
                  onClick={() => toggleExpanded(cap.id)}
                  aria-expanded={isOpen}
                >
                  <td
                    onClick={(e) => e.stopPropagation()}
                    style={{ textAlign: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => toggleSelected(cap.id)}
                      aria-label={`Select cap ${cap.id}`}
                    />
                  </td>

                  <td>{cap.beer_name}</td>
                  <td>{cap.cap_no}</td>
                  <td>{cap.caps_country?.country_name_full ?? "-"}</td>
                  <td>{cap.sheet ?? "-"}</td>
                  <td style={{ fontWeight: 700 }}>{cap.avail}</td>

                  <td onClick={(e) => e.stopPropagation()}>
					{(() => {
					  const photoPath = cap.photo_caps?.photo_path;

					  if (!photoPath) {
						return <div className="thumb-placeholder">No photo</div>;
					  }

					  const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${photoPath}`;

					  return (
						<img
						  className="thumb"
						  src={imageUrl}
						  alt="cap"
						  style={{ cursor: "zoom-in" }}
						  onClick={() => {
							setPreviewUrl(imageUrl);
						  }}
						/>
					  );
					})()}
                  </td>
                </tr>

                {isOpen && (
                  <tr className="table-details-row">
                    <td colSpan={7}>
                      <div className="details-grid">
                        <div><span className="label">ID:</span> {cap.id}</div>
                        <div><span className="label">Issued year:</span> {cap.issued_year ?? "-"}</div>
                        <div><span className="label">Entry date:</span> {cap.entry_date ?? "-"}</div>
                        <div><span className="label">Source:</span> {cap.caps_sources?.source_name ?? "-"}</div>
                      </div>

                      <div>
                        <span className="label">Tags:</span>
                        <span className="pill-wrap">
                          {tagList.length ? tagList.map((t) => (
                            <span key={t} className="pill">{t}</span>
                          )) : <span className="muted">none</span>}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
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
