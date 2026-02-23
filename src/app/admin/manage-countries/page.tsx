"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
  active: boolean;
};

type ApiResp = {
  data: CountryRow[];
  total: number;
  page: number;
  limit: number;
  sort: string;
  filters: { country: string; abb: string; active: string };
};

type SortKey =
  | "country_asc"
  | "country_desc"
  | "abb_asc"
  | "abb_desc"
  | "active_asc"
  | "active_desc"
  | "id_asc"
  | "id_desc";

function normText(x: string) {
  return x.trim();
}

function normAbb(x: string) {
  return x.trim().toUpperCase();
}

export default function ManageCountriesPage() {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [sort, setSort] = useState<SortKey>("country_asc");

  const [filterCountry, setFilterCountry] = useState("");
  const [filterAbb, setFilterAbb] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "true" | "false">("all");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAbb, setAddAbb] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftAbb, setDraftAbb] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  const lastLoadedRef = useRef<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const effectiveCountry = useMemo(() => {
    const v = normText(filterCountry);
    return v.length >= 2 ? v : "";
  }, [filterCountry]);

  const effectiveAbb = useMemo(() => {
    const v = normAbb(filterAbb);
    return v.length >= 2 ? v : "";
  }, [filterAbb]);

  function buildQuery(p: number) {
    const qs = new URLSearchParams();
    qs.set("page", String(p));
    qs.set("limit", String(limit));
    qs.set("sort", sort);
    if (effectiveCountry) qs.set("country", effectiveCountry);
    if (effectiveAbb) qs.set("abb", effectiveAbb);
    qs.set("active", filterActive);
    return qs.toString();
  }

  async function load(p = page) {
    setLoading(true);
    setErrorMsg(null);
    setRowMsg(null);

    const q = buildQuery(p);
    lastLoadedRef.current = q;

    try {
      const res = await fetch(`/api/admin/manage-countries?${q}`, { cache: "no-store" });
      const json = (await res.json()) as any;

      if (!res.ok) {
        setErrorMsg(json?.error ?? "Failed to load countries.");
        setRows([]);
        setTotal(0);
        return;
      }

      const out = json as ApiResp;
      setRows(out.data || []);
      setTotal(out.total || 0);
      setPage(out.page || p);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to load countries.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, effectiveCountry, effectiveAbb, filterActive]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort, effectiveCountry, effectiveAbb, filterActive]);

  function clearFilters() {
    setFilterCountry("");
    setFilterAbb("");
    setFilterActive("all");
    setSort("country_asc");
    setPage(1);
    setEditingId(null);
    setRowMsg(null);
    setErrorMsg(null);
  }

  function startEdit(r: CountryRow) {
    setEditingId(r.id);
    setDraftName(r.country_name_full);
    setDraftAbb(r.country_name_abb);
    setDraftActive(Boolean(r.active));
    setRowMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName("");
    setDraftAbb("");
    setDraftActive(true);
    setRowMsg(null);
  }

  function isDirty(r: CountryRow) {
    return (
      draftName.trim() !== r.country_name_full ||
      draftAbb.trim().toUpperCase() !== r.country_name_abb ||
      Boolean(draftActive) !== Boolean(r.active)
    );
  }

  async function saveEdit(id: number) {
    const original = rows.find((x) => x.id === id);
    if (!original) return;

    const payload = {
      id,
      country_name_full: draftName.trim(),
      country_name_abb: draftAbb.trim().toUpperCase(),
      active: Boolean(draftActive),
    };

    setSaveBusy(true);
    setRowMsg(null);

    try {
      const res = await fetch("/api/admin/manage-countries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setRowMsg(json?.error ?? "Save failed.");
        return;
      }

      const updated: CountryRow = json.data;
      setRows((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setEditingId(null);
      setRowMsg("Saved.");
    } catch (e: any) {
      setRowMsg(e?.message ?? "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function addCountry() {
    setAddBusy(true);
    setAddMsg(null);

    const payload = {
      country_name_full: addName.trim(),
      country_name_abb: addAbb.trim().toUpperCase(),
    };

    try {
      const res = await fetch("/api/admin/manage-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setAddMsg(json?.error ?? "Add failed.");
        return;
      }

      setAddName("");
      setAddAbb("");
      setAddMsg("Added.");
      await load(1);
      setPage(1);
    } catch (e: any) {
      setAddMsg(e?.message ?? "Add failed.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Manage countries</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="button"
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          style={{ padding: "6px 10px" }}
        >
          {showAdd ? "Hide add form" : "Show add form"}
        </button>

        <button
          className="button"
          type="button"
          onClick={clearFilters}
          style={{ padding: "6px 10px" }}
        >
          Clear filters
        </button>

        {loading ? <span>Loading…</span> : null}
        {errorMsg ? <span style={{ color: "crimson" }}>{errorMsg}</span> : null}
        {rowMsg ? <span style={{ color: "green" }}>{rowMsg}</span> : null}
      </div>

      {showAdd ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Add country</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
              <input
                className="input"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Germany"
                style={{ width: 260 }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Abbreviated</div>
              <input
                className="input"
                value={addAbb}
                onChange={(e) => setAddAbb(e.target.value)}
                placeholder="e.g. DEU"
                style={{ width: 120, textTransform: "uppercase" }}
              />
            </div>

            <button
              className="button"
              type="button"
              onClick={addCountry}
              disabled={addBusy}
              style={{ padding: "6px 10px", marginTop: 16 }}
            >
              {addBusy ? "Adding…" : "Add"}
            </button>

            {addMsg ? (
              <span style={{ marginTop: 16, color: addMsg === "Added." ? "green" : "crimson" }}>
                {addMsg}
              </span>
            ) : null}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
            Default status: <b>Active = YES</b>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Filter Country (min 2 chars)</div>
          <input
            className="input"
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            placeholder="Type 2+ chars…"
            style={{ width: 260 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Filter Abb (min 2 chars)</div>
          <input
            className="input"
            value={filterAbb}
            onChange={(e) => setFilterAbb(e.target.value)}
            placeholder="DE…"
            style={{ width: 140, textTransform: "uppercase" }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Active</div>
          <select
            className="input"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as any)}
            style={{ width: 140 }}
          >
            <option value="all">All</option>
            <option value="true">YES</option>
            <option value="false">NO</option>
          </select>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 18 }}>
          Total: <b>{total}</b>
        </div>
      </div>

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 90 }}>
              <button
                className="button"
                type="button"
                onClick={() => setSort(sort === "id_asc" ? "id_desc" : "id_asc")}
                style={{ padding: "4px 8px" }}
              >
                ID {sort === "id_asc" ? "↑" : sort === "id_desc" ? "↓" : ""}
              </button>
            </th>

            <th>
              <button
                className="button"
                type="button"
                onClick={() => setSort(sort === "country_asc" ? "country_desc" : "country_asc")}
                style={{ padding: "4px 8px" }}
              >
                Country {sort === "country_asc" ? "↑" : sort === "country_desc" ? "↓" : ""}
              </button>
            </th>

            <th style={{ width: 140 }}>
              <button
                className="button"
                type="button"
                onClick={() => setSort(sort === "abb_asc" ? "abb_desc" : "abb_asc")}
                style={{ padding: "4px 8px" }}
              >
                Abbreviated {sort === "abb_asc" ? "↑" : sort === "abb_desc" ? "↓" : ""}
              </button>
            </th>

            <th style={{ width: 140 }}>
              <button
                className="button"
                type="button"
                onClick={() => setSort(sort === "active_asc" ? "active_desc" : "active_asc")}
                style={{ padding: "4px 8px" }}
              >
                Active {sort === "active_asc" ? "↑" : sort === "active_desc" ? "↓" : ""}
              </button>
            </th>

            <th style={{ width: 220 }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => {
            const isEditing = editingId === r.id;

            return (
              <tr key={r.id}>
                <td>{r.id}</td>

                <td>
                  {isEditing ? (
                    <input
                      className="input"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  ) : (
                    r.country_name_full
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <input
                      className="input"
                      value={draftAbb}
                      onChange={(e) => setDraftAbb(e.target.value)}
                      style={{ width: "100%", textTransform: "uppercase" }}
                    />
                  ) : (
                    r.country_name_abb
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={draftActive}
                        onChange={(e) => setDraftActive(e.target.checked)}
                      />
                      <span>{draftActive ? "YES" : "NO"}</span>
                    </label>
                  ) : (
                    r.active ? "YES" : "NO"
                  )}
                </td>

                <td>
                  {!isEditing ? (
                    <button
                      className="button"
                      type="button"
                      onClick={() => startEdit(r)}
                      style={{ padding: "6px 10px" }}
                    >
                      Edit
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        className="button"
                        type="button"
                        onClick={() => saveEdit(r.id)}
                        disabled={saveBusy || !isDirty(r)}
                        style={{ padding: "6px 10px" }}
                      >
                        {saveBusy ? "Saving…" : "Save"}
                      </button>

                      <button
                        className="button"
                        type="button"
                        onClick={cancelEdit}
                        disabled={saveBusy}
                        style={{ padding: "6px 10px" }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}

          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.8 }}>
                No results.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="button"
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          style={{ padding: "6px 10px" }}
        >
          Prev
        </button>

        <div style={{ opacity: 0.85 }}>
          Page <b>{page}</b> / <b>{Math.max(1, totalPages)}</b>
        </div>

        <button
          className="button"
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          style={{ padding: "6px 10px" }}
        >
          Next
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
        Note: filters activate after 2 characters for Country/Abb.
      </div>
    </div>
  );
}