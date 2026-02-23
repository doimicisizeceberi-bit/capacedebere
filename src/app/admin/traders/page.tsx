"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type TraderRow = {
  id: number;
  name: string;
  country_id: number;
  country_name_full: string;
  country_name_abb: string;
  details: string | null;
  created_at: string;
  completed_trades: number;
  has_trades: boolean;
};

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
};

export default function TradersPage() {
  /* =========================
     Countries (create + edit + filter)
  ========================= */
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [countriesMsg, setCountriesMsg] = useState("");

  async function loadCountries() {
    setCountriesMsg("");
    const res = await fetch("/api/countries", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setCountries([]);
      setCountriesMsg(json?.error || "Failed to load countries");
      return;
    }
    setCountries(json.data ?? []);
  }

  useEffect(() => {
    loadCountries();
  }, []);

  const countryOptions: TypeaheadOption[] = useMemo(() => {
    return (countries ?? []).map((c) => ({
      id: c.id,
      label: c.country_name_full,
      meta: c.country_name_abb,
    }));
  }, [countries]);

  const countryFilterOptions = useMemo(() => {
    return [...countries].sort((a, b) => a.country_name_full.localeCompare(b.country_name_full));
  }, [countries]);

  /* =========================
     Create trader form (show/hide restored)
  ========================= */
  const [showCreate, setShowCreate] = useState(false);

  // optional: remember in localStorage (nice UX)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("admin_traders_showCreate");
      if (v === "1") setShowCreate(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("admin_traders_showCreate", showCreate ? "1" : "0");
    } catch {}
  }, [showCreate]);

  const [createName, setCreateName] = useState("");
  const [createCountry, setCreateCountry] = useState<TypeaheadOption | null>(null);
  const [createDetails, setCreateDetails] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const canCreate = useMemo(() => {
    return createName.trim().length >= 2 && !!createCountry?.id;
  }, [createName, createCountry]);

  async function createTrader() {
    if (!canCreate || createBusy) return;

    setCreateBusy(true);
    setCreateMsg("");

    try {
      const res = await fetch("/api/admin/traders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          country_id: createCountry!.id,
          details: createDetails.trim() ? createDetails.trim() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateMsg(json?.error || "Create failed");
        return;
      }

      setCreateMsg(`Created trader #${json.trader?.id ?? json.id ?? "?"}`);
      setCreateName("");
      setCreateCountry(null);
      setCreateDetails("");

      // keep current page/filters; just refresh
      await fetchTraders();

      // If you prefer: always show new trader immediately:
      // setPage(1);
    } catch (e: any) {
      setCreateMsg(e?.message ?? "Network error");
    } finally {
      setCreateBusy(false);
    }
  }

  /* =========================
     Sort
  ========================= */
  const [sort, setSort] = useState<
    | "id_desc"
    | "name_asc"
    | "name_desc"
    | "country_asc"
    | "country_desc"
    | "completed_asc"
    | "completed_desc"
  >("id_desc");

  const toggleSort = (col: "name" | "country" | "completed") => {
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
      if (prev === "completed_asc") return "completed_desc";
      if (prev === "completed_desc") return "id_desc";
      return "completed_asc";
    });
  };

  const sortIcon = (col: "name" | "country" | "completed") => {
    if (col === "name") return sort === "name_asc" ? "▲" : sort === "name_desc" ? "▼" : "";
    if (col === "country") return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
    return sort === "completed_asc" ? "▲" : sort === "completed_desc" ? "▼" : "";
  };

  /* =========================
     Filters (name + country)
  ========================= */
  const [nameFilter, setNameFilter] = useState("");
  const [nameQ, setNameQ] = useState("");

  const [countryIdFilter, setCountryIdFilter] = useState<number | "">("");
  const [countryIdQ, setCountryIdQ] = useState<number | "">("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = nameFilter.trim();
      setNameQ(q.length >= 2 ? q : "");
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [nameFilter]);

  useEffect(() => {
    setCountryIdQ(countryIdFilter);
    setPage(1);
  }, [countryIdFilter]);

  const clearAll = () => {
    setNameFilter("");
    setNameQ("");
    setCountryIdFilter("");
    setCountryIdQ("");
    setSort("id_desc");
    setPage(1);
  };

  /* =========================
     Pager + data
  ========================= */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(50);
  const [total, setTotal] = useState(0);

  const [rows, setRows] = useState<TraderRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  // Expanded rows (caps-like)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function fetchTraders() {
    setBusy(true);
    setMsg("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (nameQ) params.set("name", nameQ);
      if (typeof countryIdQ === "number") params.set("country_id", String(countryIdQ));

      const res = await fetch(`/api/traders?${params.toString()}`, { cache: "no-store" });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        console.error("Traders API returned non-JSON:", res.status, res.statusText, text.slice(0, 300));
        setMsg(`Traders API returned non-JSON (${res.status}). Check route path.`);
        setRows([]);
        setTotal(0);
        return;
      }

      if (!res.ok) {
        setRows([]);
        setTotal(0);
        setMsg(json?.error || "Failed to load traders");
        return;
      }

      setRows(json.data ?? []);
      setTotal(json.total ?? 0);

      // caps-like behavior: list refreshed => collapse expansions
      // (editing flow is local-update, so it won't call fetchTraders())
      setExpandedIds(new Set());
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setMsg(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchTraders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, sort, nameQ, countryIdQ]);

  /* =========================
     Modify mode state (single active edit)
  ========================= */
  const [editingId, setEditingId] = useState<number | null>(null);

  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState<TypeaheadOption | null>(null);
  const [editDetails, setEditDetails] = useState("");

  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<string>("");

  const startModify = (r: TraderRow) => {
    setExpandedIds((prev) => new Set(prev).add(r.id)); // keep open
    setEditingId(r.id);
    setEditMsg("");
    setEditName(r.name ?? "");
    setEditDetails(r.details ?? "");
    setEditCountry(countryOptions.find((o) => o.id === r.country_id) ?? null);
  };

  const cancelModify = () => {
    setEditingId(null);
    setEditMsg("");
    setEditName("");
    setEditCountry(null);
    setEditDetails("");
  };

  async function saveModify() {
    if (editingId == null) return;

    const name = editName.trim();
    if (name.length < 2) {
      setEditMsg("Name must be at least 2 characters.");
      return;
    }
    if (!editCountry?.id) {
      setEditMsg("Please select a country.");
      return;
    }

    setEditBusy(true);
    setEditMsg("");

    try {
      const res = await fetch("/api/admin/traders/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name,
          country_id: editCountry.id,
          details: editDetails.trim() ? editDetails.trim() : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setEditMsg(json?.error || "Save failed");
        return;
      }

      // update locally; keep expanded open
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== editingId) return r;
          const c = countries.find((x) => x.id === editCountry.id);
          return {
            ...r,
            name,
            country_id: editCountry.id,
            country_name_full: c?.country_name_full ?? r.country_name_full,
            country_name_abb: c?.country_name_abb ?? r.country_name_abb,
            details: editDetails.trim() ? editDetails.trim() : null,
          };
        })
      );

      // keep expanded open explicitly
      setExpandedIds((prev) => new Set(prev).add(editingId));

      setEditMsg("Saved!");
      setEditingId(null);
    } catch (e: any) {
      setEditMsg(e?.message ?? "Network error");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteTrader(row: TraderRow) {
    if (row.has_trades) {
      setEditMsg("Cannot delete: trades exist for this trader.");
      return;
    }

    const ok = window.confirm(`Delete trader "${row.name}" (#${row.id})? This cannot be undone.`);
    if (!ok) return;

    setEditBusy(true);
    setEditMsg("");

    try {
      const res = await fetch("/api/admin/traders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        setEditMsg(json?.error || "Delete failed");
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      setEditingId(null);
      setEditMsg("");
    } catch (e: any) {
      setEditMsg(e?.message ?? "Network error");
    } finally {
      setEditBusy(false);
    }
  }

  if (busy) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Traders</h1>

      {/* Create: show/hide */}
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="button" type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Hide create trader" : "Add new trader"}
        </button>
        {createMsg && (
          <span className="help" style={{ color: createMsg.toLowerCase().includes("created") ? "green" : "crimson" }}>
            {createMsg}
          </span>
        )}
      </div>

      {showCreate && (
        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Create trader</label>

            <div className="actions" style={{ alignItems: "center" }}>
              <input
                className="input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Name (min 2)…"
                disabled={createBusy}
                style={{ minWidth: 220 }}
              />

              <div style={{ minWidth: 260 }}>
                <TypeaheadSelect
                  options={countryOptions}
                  value={createCountry}
                  onChange={(opt) => setCreateCountry(opt)}
                  placeholder="Type country (min 2)…"
                  minChars={2}
                  maxResults={12}
                  inputClassName="select"
                />
              </div>

              <input
                className="input"
                value={createDetails}
                onChange={(e) => setCreateDetails(e.target.value)}
                placeholder="Details (optional)"
                disabled={createBusy}
                style={{ minWidth: 260 }}
              />

              <button className="button" type="button" onClick={createTrader} disabled={!canCreate || createBusy}>
                {createBusy ? "Creating..." : "Create"}
              </button>
            </div>

            {countriesMsg && <div className="help" style={{ color: "crimson" }}>{countriesMsg}</div>}
          </div>
        </div>
      )}

      <div style={{ margin: "24px 0", borderTop: "1px solid #e5e7eb" }} />

      {/* Filters bar */}
      <div className="filters-bar">
        <div className="filters-active">
          {(nameQ || typeof countryIdQ === "number") ? (
            <>
              <span className="muted">Active filters:</span>
              {nameQ && <span className="chip">Name: {nameQ}</span>}
              {typeof countryIdQ === "number" && (
                <span className="chip">
                  Country: {countries.find((c) => c.id === countryIdQ)?.country_name_abb ?? countryIdQ}
                </span>
              )}
            </>
          ) : (
            <span className="muted">No filters</span>
          )}
          {msg && <span className="help" style={{ color: "crimson" }}>{msg}</span>}
        </div>

        <button className="linklike" type="button" onClick={clearAll} disabled={!nameFilter && !countryIdFilter && sort === "id_desc"}>
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
            Page <b>{page}</b> / <b>{Math.max(1, Math.ceil(total / limit))}</b>
          </span>

          <button className="button" type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / limit)}>
            Next
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th></th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("name")}>
                  Name <span className="th-icon">{sortIcon("name")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="filter (min 2)…"
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
                <button className="th-sort" type="button" onClick={() => toggleSort("country")}>
                  Country <span className="th-icon">{sortIcon("country")}</span>
                </button>
                <div className="th-filter">
                  <select
                    className="th-input"
                    value={countryIdFilter}
                    onChange={(e) => setCountryIdFilter(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">all</option>
                    {countryFilterOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.country_name_full} ({c.country_name_abb})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("completed")}>
                  Completed trades <span className="th-icon">{sortIcon("completed")}</span>
                </button>
                <div className="help" style={{ marginTop: 0 }} />
              </div>
            </th>

            <th>Has trades</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => {
            const isOpen = expandedIds.has(r.id);
            const isEditing = editingId === r.id;

            return (
              <React.Fragment key={r.id}>
                <tr className="table-row-clickable" onClick={() => toggleExpanded(r.id)} aria-expanded={isOpen}>
                  <td className="chevron-cell">
                    <span className={`chevron ${isOpen ? "open" : ""}`}>▶</span>
                  </td>

                  <td>{r.name}</td>
                  <td>
                    {r.country_name_full} <span className="muted">({r.country_name_abb})</span>
                  </td>
                  <td>{r.completed_trades ?? 0}</td>
                  <td>{r.has_trades ? "yes" : "no"}</td>
                </tr>

                {isOpen && (
                  <tr className="table-details-row">
                    <td colSpan={5}>
                      {!isEditing ? (
                        <>
                          <div className="details-grid" style={{ gridTemplateColumns: "repeat(3, minmax(160px, 1fr))" }}>
                            <div>
                              <span className="label">ID:</span> {r.id}
                            </div>
                            <div>
                              <span className="label">Country:</span> {r.country_name_full} ({r.country_name_abb})
                            </div>
                            <div>
                              <span className="label">Created:</span> {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                            </div>
                          </div>

                          <div style={{ padding: "0 8px 12px" }}>
                            <span className="label">Details:</span>{" "}
                            {r.details ? <span>{r.details}</span> : <span className="muted">none</span>}
                          </div>

                          <div className="actions" style={{ padding: "0 8px 12px" }}>
                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startModify(r);
                              }}
                            >
                              Modify
                            </button>
                            {r.has_trades && <span className="help">Delete is blocked (trades exist).</span>}
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
                                onChange={(opt) => setEditCountry(opt)}
                                placeholder="Type country (min 2)…"
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
                              rows={4}
                              disabled={editBusy}
                            />
                          </div>

                          <div className="actions">
                            <button
                              className="button"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                saveModify();
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
                                cancelModify();
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
                                deleteTrader(r);
                              }}
                              disabled={editBusy || r.has_trades}
                              title={r.has_trades ? "Cannot delete: trades exist" : "Delete trader"}
                            >
                              Delete
                            </button>

                            {editMsg && (
                              <span className="help" style={{ color: editMsg === "Saved!" ? "green" : "crimson" }}>
                                {editMsg}
                              </span>
                            )}
                          </div>

                          {r.has_trades && (
                            <div className="help">
                              Cannot delete this trader because at least one trade exists (pending/completed/canceled).
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

          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No traders found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
