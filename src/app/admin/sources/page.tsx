"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
};

type Trader = {
  id: number;
  name: string;
  country_id: number;
  details: string | null;
};

type SourceRow = {
  id: number;
  source_name: string;
  source_country: number;
  country_name_full: string;
  country_name_abb: string;
  details: string | null;
  is_trader: boolean;
  trader_origin_id: number | null;
  has_caps: boolean;
  caps_count: number;
};

type SortKey =
  | "id_desc"
  | "name_asc"
  | "name_desc"
  | "country_asc"
  | "country_desc"
  | "is_trader_asc"
  | "is_trader_desc"
  | "caps_count_desc"
  | "caps_count_asc";

export default function SourcesPage() {
  /* =========================
     Create section visibility
  ========================= */
  const [showCreate, setShowCreate] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem("admin_sources_show_create");
      if (v === "0") setShowCreate(false);
    } catch {}
  }, []);

  const toggleShowCreate = () => {
    setShowCreate((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin_sources_show_create", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  /* =========================
     Reference data
  ========================= */
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [countryAbbById, setCountryAbbById] = useState<Record<number, string>>({});

  async function loadCountries() {
    const res = await fetch("/api/countries", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) return;

    const list: CountryRow[] = json.data ?? [];
    setCountries(list);

    const map: Record<number, string> = {};
    list.forEach((c) => (map[Number(c.id)] = String(c.country_name_abb)));
    setCountryAbbById(map);
  }

  async function loadTraders() {
    const res = await fetch("/api/admin/traders/list?limit=200", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) return;
    setTraders(json.traders ?? []);
  }

  useEffect(() => {
    loadCountries();
    loadTraders();
  }, []);

  /* =========================
     Create form
  ========================= */
  const [fromTrader, setFromTrader] = useState(false);

  // trader import
  const traderOptions: TypeaheadOption[] = useMemo(() => {
    return (traders ?? []).map((t) => ({
      id: t.id,
      label: t.name,
      meta: countryAbbById[t.country_id] ?? "—",
    }));
  }, [traders, countryAbbById]);

  const [selectedTrader, setSelectedTrader] = useState<TypeaheadOption | null>(null);

  // manual create
  const countryOptions: TypeaheadOption[] = useMemo(() => {
    return (countries ?? []).map((c) => ({
      id: c.id,
      label: c.country_name_full,
      meta: c.country_name_abb,
    }));
  }, [countries]);

  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState<TypeaheadOption | null>(null);
  const [newDetails, setNewDetails] = useState("");

  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string>("");

  const canCreate = useMemo(() => {
    if (fromTrader) return Number.isInteger(selectedTrader?.id) && (selectedTrader?.id ?? 0) > 0;
    return newName.trim().length >= 2 && Number.isInteger(newCountry?.id) && (newCountry?.id ?? 0) > 0;
  }, [fromTrader, selectedTrader, newName, newCountry]);

  async function createSource() {
    if (!canCreate || createBusy) return;

    setCreateBusy(true);
    setCreateMsg("");

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          fromTrader
            ? { from_trader: true, trader_id: selectedTrader!.id }
            : {
                from_trader: false,
                source_name: newName.trim(),
                source_country: newCountry!.id,
                details: newDetails.trim() || null,
              }
        ),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateMsg(json?.error || "Create failed");
        return;
      }

      setCreateMsg(`Created source #${json.source?.id ?? "?"}`);

      setNewName("");
      setNewCountry(null);
      setNewDetails("");
      setSelectedTrader(null);

      await loadSources(true);
    } catch (e: any) {
      setCreateMsg(e?.message ?? "Network error");
    } finally {
      setCreateBusy(false);
    }
  }

  /* =========================
     List + filters + pager
  ========================= */
  const [sort, setSort] = useState<SortKey>("id_desc");

  const [nameFilter, setNameFilter] = useState("");
  const [nameQ, setNameQ] = useState("");

  const [countryFilter, setCountryFilter] = useState<TypeaheadOption | null>(null);
  const countryIdQ = countryFilter?.id ? String(countryFilter.id) : "";

  const [isTraderFilter, setIsTraderFilter] = useState<"" | "true" | "false">("");
  const isTraderQ = isTraderFilter;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(50);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listMsg, setListMsg] = useState("");

  // expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState<TypeaheadOption | null>(null);
  const [editDetails, setEditDetails] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<string>("");

  const startEdit = (row: SourceRow) => {
    setExpandedIds((prev) => new Set(prev).add(row.id)); // keep open
    setEditingId(row.id);
    setEditMsg("");
    setEditName(row.source_name ?? "");
    setEditCountry({ id: row.source_country, label: row.country_name_full, meta: row.country_name_abb });
    setEditDetails(row.details ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMsg("");
    setEditBusy(false);
    setEditName("");
    setEditCountry(null);
    setEditDetails("");
  };

  // debounce name filter (min 2)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = nameFilter.trim();
      setNameQ(q.length >= 2 ? q : "");
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [nameFilter]);

  const clearAll = () => {
    setNameFilter("");
    setNameQ("");
    setCountryFilter(null);
    setIsTraderFilter("");
    setSort("id_desc");
    setPage(1);
  };

  async function loadSources(goToFirstPage = false) {
    setListBusy(true);
    setListMsg("");

    try {
      const p = goToFirstPage ? 1 : page;
      if (goToFirstPage) setPage(1);

      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (nameQ) params.set("name", nameQ);
      if (countryIdQ) params.set("country_id", countryIdQ);
      if (isTraderQ) params.set("is_trader", isTraderQ);

      const res = await fetch(`/api/sources?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setListMsg(json?.error || "Failed to load sources");
        setSources([]);
        setTotal(0);
        return;
      }

      setSources(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setListMsg(e?.message ?? "Network error");
      setSources([]);
      setTotal(0);
    } finally {
      setListBusy(false);
    }
  }

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, sort, nameQ, countryIdQ, isTraderQ]);

  /* =========================
     Sort helpers (caps-like)
  ========================= */
  const toggleSortKey = (col: "name" | "country" | "trader" | "caps") => {
    setPage(1);
    setSort((prev) => {
      if (col === "name") {
        if (prev === "name_asc") return "name_desc";
        if (prev === "name_desc") return "id_desc";
        return "name_asc";
      }
      if (col === "country") {
        if (prev === "country_asc") return "country_desc";
        if (prev === "country_desc") return "id_desc";
        return "country_asc";
      }
      if (col === "trader") {
        if (prev === "is_trader_asc") return "is_trader_desc";
        if (prev === "is_trader_desc") return "id_desc";
        return "is_trader_asc";
      }
      if (prev === "caps_count_desc") return "caps_count_asc";
      if (prev === "caps_count_asc") return "id_desc";
      return "caps_count_desc";
    });
  };

  const sortIcon = (col: "name" | "country" | "trader" | "caps") => {
    const up = "▲";
    const down = "▼";
    if (col === "name") return sort === "name_asc" ? up : sort === "name_desc" ? down : "";
    if (col === "country") return sort === "country_asc" ? up : sort === "country_desc" ? down : "";
    if (col === "trader") return sort === "is_trader_asc" ? up : sort === "is_trader_desc" ? down : "";
    return sort === "caps_count_asc" ? up : sort === "caps_count_desc" ? down : "";
  };

  /* =========================
     Update + Delete
  ========================= */
  async function saveEdit(id: number) {
    if (editBusy) return;

    const n = editName.trim();
    const cId = editCountry?.id ?? 0;

    if (n.length < 2) return setEditMsg("Name must be at least 2 characters.");
    if (!Number.isInteger(cId) || cId < 1) return setEditMsg("Country is required.");

    setEditBusy(true);
    setEditMsg("");

    try {
      const res = await fetch("/api/admin/sources/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          source_name: n,
          source_country: cId,
          details: editDetails.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setEditMsg(json?.error || "Update failed");
        return;
      }

      const updated: SourceRow = json.source;

      // update locally, keep expanded open
      setSources((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setExpandedIds((prev) => new Set(prev).add(id));
      setEditingId(null);
      setEditMsg("");
    } catch (e: any) {
      setEditMsg(e?.message ?? "Network error");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteSource(row: SourceRow) {
    if (row.has_caps) {
      alert("Cannot delete: this source is used by at least one beer cap.");
      return;
    }
    const ok = window.confirm(`Delete source #${row.id} (${row.source_name})?`);
    if (!ok) return;

    try {
      const res = await fetch("/api/admin/sources/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json?.error || "Delete failed");
        return;
      }

      setSources((prev) => prev.filter((x) => x.id !== row.id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      setTotal((t) => Math.max(0, t - 1));
      if (sources.length === 1 && page > 1) setPage((p) => p - 1);
    } catch (e: any) {
      alert(e?.message ?? "Network error");
    }
  }

  return (
    <main className="page">
      <h1>Beer-cap Sources</h1>

      {/* Create section */}
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <div className="muted">Add/edit/list sources (people who gave you caps)</div>

        <button className="button" type="button" onClick={toggleShowCreate}>
          {showCreate ? "Hide add source" : "Show add source"}
        </button>
      </div>

      {showCreate && (
        <div className="form" style={{ marginTop: 12, maxWidth: 820 }}>
          <div className="field">
            <label>Add new source</label>

            <label className="checkbox" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={fromTrader}
                onChange={(e) => {
                  setFromTrader(e.target.checked);
                  setCreateMsg("");
                  setSelectedTrader(null);
                  setNewName("");
                  setNewCountry(null);
                  setNewDetails("");
                }}
              />
              Add source from traders (import snapshot)
            </label>

            <div className="actions" style={{ alignItems: "center", marginTop: 10 }}>
              {fromTrader ? (
                <>
                  <div style={{ minWidth: 260 }}>
                    <TypeaheadSelect
                      options={traderOptions}
                      value={selectedTrader}
                      onChange={setSelectedTrader}
                      placeholder="Type trader (min 2)…"
                      minChars={2}
                      maxResults={12}
                      inputClassName="pager-select"
                    />
                  </div>

                  <div className="help">
                    Snapshot will copy: name + country + details, and mark <b>is_trader = true</b>.
                  </div>
                </>
              ) : (
                <>
                  <input
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Source name (min 2)…"
                    disabled={createBusy}
                    style={{ minWidth: 240 }}
                  />

                  <div style={{ minWidth: 260 }}>
                    <TypeaheadSelect
                      options={countryOptions}
                      value={newCountry}
                      onChange={setNewCountry}
                      placeholder="Type country (min 2)…"
                      minChars={2}
                      maxResults={12}
                      inputClassName="pager-select"
                    />
                  </div>

                  <input
                    className="input"
                    value={newDetails}
                    onChange={(e) => setNewDetails(e.target.value)}
                    placeholder="Details (optional)"
                    disabled={createBusy}
                    style={{ minWidth: 240 }}
                  />
                </>
              )}

              <button className="button" type="button" onClick={createSource} disabled={!canCreate || createBusy}>
                {createBusy ? "Saving..." : "Create"}
              </button>
            </div>

            {createMsg && (
              <div className="help" style={{ marginTop: 8, color: createMsg.toLowerCase().includes("created") ? "green" : "crimson" }}>
                {createMsg}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ margin: "22px 0", borderTop: "1px solid #e5e7eb" }} />

      {/* Filters bar */}
      <div className="filters-bar">
        <div className="filters-active">
          {(nameQ || countryIdQ || isTraderQ) ? (
            <>
              <span className="muted">Active filters:</span>
              {nameQ && <span className="chip">Name: {nameQ}</span>}
              {countryIdQ && (
                <span className="chip">
                  Country: {countries.find((c) => c.id === Number(countryIdQ))?.country_name_abb ?? countryIdQ}
                </span>
              )}
              {isTraderQ && <span className="chip">Trader: {isTraderQ}</span>}
            </>
          ) : (
            <span className="muted">No filters</span>
          )}
        </div>

        <button
          className="linklike"
          type="button"
          onClick={clearAll}
          disabled={!nameFilter && !countryFilter && !isTraderFilter && sort === "id_desc"}
        >
          Clear all
        </button>
      </div>

      {/* Pager */}
      <div className="pager">
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
              disabled={listBusy}
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
          <button className="button" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={listBusy || page === 1}>
            Prev
          </button>

          <span className="pager-info">
            Page <b>{page}</b> / <b>{totalPages}</b>
          </span>

          <button className="button" type="button" onClick={() => setPage((p) => p + 1)} disabled={listBusy || page >= totalPages}>
            Next
          </button>
        </div>
      </div>

      {listBusy && <div className="help">Loading…</div>}
      {listMsg && (
        <div className="help" style={{ color: "crimson" }}>
          {listMsg}
        </div>
      )}

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th></th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSortKey("name")} disabled={listBusy}>
                  Name <span className="th-icon">{sortIcon("name")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="filter (min 2)…"
                    disabled={listBusy}
                  />
                  {nameFilter && (
                    <button className="th-clear" type="button" onClick={() => setNameFilter("")} aria-label="Clear name filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSortKey("country")} disabled={listBusy}>
                  Country <span className="th-icon">{sortIcon("country")}</span>
                </button>
                <div className="th-filter">
                  <TypeaheadSelect
                    options={countryOptions}
                    value={countryFilter}
                    onChange={(opt) => {
                      setCountryFilter(opt);
                      setPage(1);
                    }}
                    placeholder="Type country…"
                    minChars={2}
                    maxResults={10}
                    inputClassName="th-input"
                  />
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSortKey("trader")} disabled={listBusy}>
                  Trader <span className="th-icon">{sortIcon("trader")}</span>
                </button>
                <div className="th-filter">
                  <select
                    className="th-input"
                    value={isTraderFilter}
                    onChange={(e) => {
                      setIsTraderFilter(e.target.value as any);
                      setPage(1);
                    }}
                    disabled={listBusy}
                  >
                    <option value="">all</option>
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSortKey("caps")} disabled={listBusy}>
                  Caps <span className="th-icon">{sortIcon("caps")}</span>
                </button>
                <div className="help" style={{ marginTop: 0 }} />
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          {sources.map((s) => {
            const open = expandedIds.has(s.id);
            const isEditing = editingId === s.id;

            return (
              <React.Fragment key={s.id}>
                <tr className="table-row-clickable" onClick={() => toggleExpanded(s.id)} aria-expanded={open}>
                  <td className="chevron-cell">
                    <span className={`chevron ${open ? "open" : ""}`}>▶</span>
                  </td>
                  <td>{s.source_name}</td>
                  <td>
                    {s.country_name_full} <span className="muted">({s.country_name_abb})</span>
                  </td>
                  <td>{s.is_trader ? "yes" : "no"}</td>
                  <td>{s.caps_count ?? 0}</td>
                </tr>

                {open && (
                  <tr className="table-details-row">
                    <td colSpan={5}>
                      {!isEditing ? (
                        <>
                          <div className="details-grid" style={{ gridTemplateColumns: "repeat(4, minmax(160px, 1fr))" }}>
                            <div>
                              <span className="label">ID:</span> {s.id}
                            </div>
                            <div>
                              <span className="label">Country:</span> {s.country_name_full} ({s.country_name_abb})
                            </div>
                            <div>
                              <span className="label">Trader:</span> {s.is_trader ? "yes" : "no"}
                            </div>
                            <div>
                              <span className="label">Caps using:</span> {s.caps_count ?? 0}
                            </div>
                          </div>

                          <div style={{ padding: "0 8px 12px" }}>
                            <span className="label">Details:</span>{" "}
                            {s.details?.trim() ? <span>{s.details}</span> : <span className="muted">none</span>}
                          </div>

                          <div className="actions" style={{ padding: "0 8px 12px" }}>
                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(s);
                              }}
                            >
                              Modify
                            </button>

                            {s.has_caps && <span className="help">Delete is blocked (source is used by beer caps).</span>}
                          </div>
                        </>
                      ) : (
                        <div className="form" style={{ maxWidth: 900, marginTop: 0, padding: "10px 8px 12px" }}>
                          <div className="row2">
                            <div className="field">
                              <label>Name</label>
                              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={editBusy} />
                            </div>

                            <div className="field">
                              <label>Country</label>
                              <TypeaheadSelect
                                options={countryOptions}
                                value={editCountry}
                                onChange={setEditCountry}
                                placeholder="Type country…"
                                minChars={2}
                                maxResults={12}
                                inputClassName="select"
                              />
                            </div>
                          </div>

                          <div className="field">
                            <label>Details</label>
                            <textarea
                              className="input"
                              value={editDetails}
                              onChange={(e) => setEditDetails(e.target.value)}
                              disabled={editBusy}
                              rows={4}
                            />
                          </div>

                          <div className="help">
                            Trader: <b>{sources.find((x) => x.id === s.id)?.is_trader ? "yes" : "no"}</b> (not editable)
                          </div>

                          <div className="actions">
                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                saveEdit(s.id);
                              }}
                              disabled={editBusy}
                            >
                              {editBusy ? "Saving..." : "Save"}
                            </button>

                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEdit();
                              }}
                              disabled={editBusy}
                            >
                              Cancel
                            </button>

                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSource(s);
                              }}
                              disabled={editBusy || s.has_caps}
                              title={s.has_caps ? "Cannot delete: used by beer caps" : "Delete source"}
                            >
                              Delete
                            </button>

                            {editMsg && (
                              <span className="help" style={{ color: editMsg === "Saved!" ? "green" : "crimson" }}>
                                {editMsg}
                              </span>
                            )}
                          </div>

                          {s.has_caps && (
                            <div className="help">
                              Cannot delete this source because at least one beer cap references it (beer_caps.source).
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {sources.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No sources found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
