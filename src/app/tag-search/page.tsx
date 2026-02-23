"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

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
};

type TagRow = { id: number; tag: string; type: string };

type SelectedTag = {
  id: number;
  tag: string;
  type: string;
};

export default function TagSearchPage() {
  /* =========================
     OR / AND mode
  ========================= */
  const [mode, setMode] = useState<"or" | "and">("or");

  /* =========================
     Typeahead option pools
     (since TypeaheadSelect filters locally)
  ========================= */
  const [tagOptions, setTagOptions] = useState<TypeaheadOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<TypeaheadOption[]>([]);

  const [tagPick, setTagPick] = useState<TypeaheadOption | null>(null);
  const [typePick, setTypePick] = useState<TypeaheadOption | null>(null);

  /* =========================
     Selected tags (source of truth)
  ========================= */
  const [selected, setSelected] = useState<Map<number, SelectedTag>>(new Map());

  const selectedTagsArray = useMemo(() => Array.from(selected.values()), [selected]);

  const selectedIds = useMemo(() => Array.from(selected.keys()), [selected]);

  const selectedByType = useMemo(() => {
    const m = new Map<string, SelectedTag[]>();
    for (const t of selected.values()) {
      const k = t.type || "custom";
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    // stable order: type asc, then tag asc
    const sortedTypes = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
    const out: Array<{ type: string; tags: SelectedTag[] }> = [];
    for (const type of sortedTypes) {
      const tags = (m.get(type) ?? []).slice().sort((a, b) => a.tag.localeCompare(b.tag));
      out.push({ type, tags });
    }
    return out;
  }, [selected]);

  const hasSelection = selected.size > 0;

  /* =========================
     Load option pools
  ========================= */
  useEffect(() => {
    // Types (distinct)
    (async () => {
      try {
        const res = await fetch(`/api/tag-types`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          console.error("tag-types error:", json?.error);
          setTypeOptions([]);
          return;
        }
        setTypeOptions((json.data ?? []) as TypeaheadOption[]);
      } catch (e) {
        console.error("tag-types network error:", e);
        setTypeOptions([]);
      }
    })();

    // Tags pool (we fetch a large page; TypeaheadSelect filters locally)
    // Assumes your existing /api/tags supports page/pageSize/sort
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("pageSize", "5000");
        params.set("sort", "tag_asc");
        const res = await fetch(`/api/tags?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          console.error("tags error:", json?.error);
          setTagOptions([]);
          return;
        }
        const rows = (json.data ?? []) as TagRow[];
        setTagOptions(
          rows.map((r) => ({
            id: r.id,
            label: r.tag,
            meta: r.type,
          }))
        );
      } catch (e) {
        console.error("tags network error:", e);
        setTagOptions([]);
      }
    })();
  }, []);

  /* =========================
     Add single tag
  ========================= */
  useEffect(() => {
    if (!tagPick) return;

    // tagPick is selected from options, so id is real
    const id = tagPick.id;
    if (id > 0) {
      setSelected((prev) => {
        if (prev.has(id)) return prev;
        const next = new Map(prev);
        next.set(id, { id, tag: tagPick.label, type: tagPick.meta ?? "custom" });
        return next;
      });
    }

    // clear input (so user can add another immediately)
    setTagPick(null);
  }, [tagPick]);

  /* =========================
     Add type => expand to all tags of that type
  ========================= */
  useEffect(() => {
    if (!typePick) return;

    const type = typePick.label;

    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("type", type);
        params.set("page", "1");
        params.set("pageSize", "10000");
        params.set("sort", "tag_asc");

        const res = await fetch(`/api/tags?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          console.error("type expansion /tags error:", json?.error);
          return;
        }

        const rows = (json.data ?? []) as TagRow[];

        setSelected((prev) => {
          const next = new Map(prev);
          for (const r of rows) {
            if (!next.has(r.id)) {
              next.set(r.id, { id: r.id, tag: r.tag, type: r.type ?? "custom" });
            }
          }
          return next;
        });
      } catch (e) {
        console.error("type expansion network error:", e);
      }
    })();

    setTypePick(null);
  }, [typePick]);

  const removeOne = (id: number) => {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const removeType = (type: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const [id, t] of next.entries()) {
        if ((t.type || "custom") === type) next.delete(id);
      }
      return next;
    });
  };

  const clearSelected = () => setSelected(new Map());

  /* =========================
     Caps table state (reused from your /caps)
  ========================= */
  const toggleSort = (col: "beer" | "country" | "sheet") => {
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
      // sheet
      if (prev === "sheet_asc") return "sheet_desc";
      if (prev === "sheet_desc") return "id_desc";
      return "sheet_asc";
    });
  };

  const sortIcon = (col: "beer" | "country" | "sheet") => {
    if (col === "beer")
      return sort === "beer_name_asc" ? "▲" : sort === "beer_name_desc" ? "▼" : "";
    if (col === "country")
      return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
    return sort === "sheet_asc" ? "▲" : sort === "sheet_desc" ? "▼" : "";
  };

  const clearAllCapsFilters = () => {
    setBeerFilter("");
    setCountryFilter("");
    setSheetFilter("");
    setSort("id_desc");
    setPage(1);
  };

  const [sort, setSort] = useState<
    | "id_desc"
    | "beer_name_asc"
    | "beer_name_desc"
    | "country_asc"
    | "country_desc"
    | "sheet_asc"
    | "sheet_desc"
  >("id_desc");

  const [beerFilter, setBeerFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");

  // debounced / active filters actually sent to API
  const [beerQ, setBeerQ] = useState("");
  const [countryQ, setCountryQ] = useState("");
  const [sheetQ, setSheetQ] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
  const [total, setTotal] = useState(0);

  const [caps, setCaps] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // debounce text filters (same as your /caps)
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

  // Fetch caps when selection or caps-table state changes
  useEffect(() => {
    // Rule: show nothing when no tags selected
    if (!hasSelection) {
      setCaps([]);
      setTotal(0);
      setLoading(false);
      setExpandedIds(new Set());
      return;
    }

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

        params.set("tag_ids", selectedIds.join(","));
        params.set("tag_mode", mode);

        const res = await fetch(`/api/caps?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          console.error("API error:", json?.error);
          setCaps([]);
          setTotal(0);
        } else {
          setCaps(json.data || []);
          setTotal(json.total || 0);
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
  }, [hasSelection, selectedIds, mode, page, limit, sort, beerQ, countryQ, sheetQ]);

  // full size thumb (same as /caps)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="page">
      <h1>Tag Search</h1>

      {/* Top builder: two typeaheads + mode */}
      <div className="filters-bar" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ marginBottom: "0.25rem" }}>Add tag</div>
            <TypeaheadSelect
              options={tagOptions}
              value={tagPick}
              onChange={setTagPick}
              placeholder="Type 2+ chars…"
              minChars={2}
              maxResults={12}
              inputClassName="th-input"
              allowCreate={false}
            />
          </div>

          <div>
            <div className="muted" style={{ marginBottom: "0.25rem" }}>Add type (adds all tags of that type)</div>
            <TypeaheadSelect
              options={typeOptions}
              value={typePick}
              onChange={setTypePick}
              placeholder="Type 2+ chars…"
              minChars={2}
              maxResults={12}
              inputClassName="th-input"
              allowCreate={false}
            />
          </div>

          <div style={{ minWidth: 220 }}>
            <div className="muted" style={{ marginBottom: "0.25rem" }}>Mode</div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={mode === "and"}
                onChange={(e) => {
                  setMode(e.target.checked ? "and" : "or");
                  setPage(1);
                }}
              />
              <span>
                {mode === "and" ? <b>AND</b> : <b>OR</b>} mode
              </span>
            </label>
            <div className="muted" style={{ marginTop: "0.25rem" }}>
              {mode === "and"
                ? "Caps must have ALL selected tags."
                : "Caps may have ANY selected tag."}
            </div>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
          <button className="linklike" type="button" onClick={clearSelected} disabled={!hasSelection}>
            Clear selected tags
          </button>
          <button
            className="linklike"
            type="button"
            onClick={clearAllCapsFilters}
            disabled={!beerFilter && !countryFilter && !sheetFilter && sort === "id_desc"}
          >
            Clear caps filters
          </button>
        </div>
      </div>

      {/* Selected area (right-ish, but we keep it responsive) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", marginTop: "1rem" }}>
        <div className="card" style={{ padding: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <b>Selected tags</b>{" "}
              <span className="muted">({selected.size})</span>
            </div>
            {!hasSelection ? (
              <span className="muted">Select a tag or a type to start</span>
            ) : null}
          </div>

          {!hasSelection ? null : (
            <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {selectedByType.map((grp) => (
                <div key={grp.type}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span className="chip">{grp.type}</span>{" "}
                      <span className="muted">({grp.tags.length})</span>
                    </div>
                    <button className="linklike" type="button" onClick={() => removeType(grp.type)}>
                      Remove all
                    </button>
                  </div>

                  <div className="pill-wrap" style={{ marginTop: "0.5rem" }}>
                    {grp.tags.map((t) => (
                      <span key={t.id} className="pill" style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                        <span>{t.tag}</span>
                        <button
                          className="linklike"
                          type="button"
                          onClick={() => removeOne(t.id)}
                          aria-label={`Remove ${t.tag}`}
                          style={{ fontSize: "0.9em" }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Caps table */}
      {!hasSelection ? null : (
        <>
          <div className="pager" style={{ marginTop: "1.25rem" }}>
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
                  <span className="muted">No caps filters</span>
                )}
              </div>
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
              <button
                className="button"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </button>

              <span className="pager-info">
                Page <b>{page}</b> / <b>{Math.max(1, Math.ceil(total / limit))}</b>
              </span>

              <button
                className="button"
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
              >
                Next
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ padding: "2rem" }}>Loading...</p>
          ) : (
            <table className="table" style={{ marginTop: "0.5rem" }}>
              <thead>
                <tr>
                  <th></th>

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

                  <th>Photo</th>
                </tr>
              </thead>

              <tbody>
                {caps.map((cap) => {
                  const isOpen = expandedIds.has(cap.id);

                  const tagList =
                    cap.beer_caps_tags?.map((x) => x.tags?.tag).filter(Boolean) ?? [];

                  return (
                    <React.Fragment key={cap.id}>
                      <tr
                        className="table-row-clickable"
                        onClick={() => toggleExpanded(cap.id)}
                        aria-expanded={isOpen}
                      >
                        <td className="chevron-cell">
                          <span className={`chevron ${isOpen ? "open" : ""}`}>▶</span>
                        </td>

                        <td>{cap.beer_name}</td>
                        <td>{cap.cap_no}</td>
                        <td>{cap.caps_country?.country_name_full ?? "-"}</td>
                        <td>{cap.sheet ?? "-"}</td>
                        <td>
                          {cap.photo_caps?.photo_path ? (
                            <img
                              className="thumb"
                              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${cap.photo_caps.photo_path}`}
                              alt="cap"
                              style={{ cursor: "zoom-in" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl(
                                  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${cap.photo_caps.photo_path}`
                                );
                              }}
                            />
                          ) : (
                            <div className="thumb-placeholder">No photo</div>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="table-details-row">
                          <td colSpan={6}>
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
          )}

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
        </>
      )}
    </main>
  );
}
