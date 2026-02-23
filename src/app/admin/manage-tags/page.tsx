"use client";

import React, { useEffect, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type TagRow = { id: number; tag: string; type: string };

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ManageTagsPage() {
  /* =========================
     Sort (tag/type + default)
  ========================= */
  const [sort, setSort] = useState<"id_desc" | "tag_asc" | "tag_desc" | "type_asc" | "type_desc">("id_desc");

  const toggleSort = (col: "tag" | "type") => {
    setPage(1);
    setSort((prev) => {
      if (col === "tag") {
        if (prev === "tag_asc") return "tag_desc";
        if (prev === "tag_desc") return "id_desc";
        return "tag_asc";
      }
      // type
      if (prev === "type_asc") return "type_desc";
      if (prev === "type_desc") return "id_desc";
      return "type_asc";
    });
  };

  const sortIcon = (col: "tag" | "type") => {
    if (col === "tag") return sort === "tag_asc" ? "▲" : sort === "tag_desc" ? "▼" : "";
    return sort === "type_asc" ? "▲" : sort === "type_desc" ? "▼" : "";
  };

  /* =========================
     Filters (typed vs active)
  ========================= */
  const [tagFilter, setTagFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [tagQ, setTagQ] = useState("");
  const [typeQ, setTypeQ] = useState("");

  const clearAll = () => {
    setTagFilter("");
    setTypeFilter("");
    setSort("id_desc");
    setPage(1);
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      const t1 = normalizeSlug(tagFilter);
      const t2 = normalizeSlug(typeFilter);

      setTagQ(t1.length >= 2 ? t1 : "");
      setTypeQ(t2.length >= 2 ? t2 : "");

      setPage(1);
    }, 250);

    return () => window.clearTimeout(t);
  }, [tagFilter, typeFilter]);

  /* =========================
     Pagination
  ========================= */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* =========================
     Data
  ========================= */
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Global type options (from /api/tags/types)
  ========================= */
  const [typeOptions, setTypeOptions] = useState<TypeaheadOption[]>([]);

  const refreshTypes = async () => {
    try {
      const res = await fetch(`/api/tags/types?limit=500`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        console.error("types api error:", json?.error);
        setTypeOptions([]);
        return;
      }
      const types: string[] = json.data || [];
      setTypeOptions(types.map((t, i) => ({ id: i + 1, label: t })));
    } catch (e) {
      console.error("types network error:", e);
      setTypeOptions([]);
    }
  };

  useEffect(() => {
    refreshTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Create form
  ========================= */
  const [newTag, setNewTag] = useState("");
  const [newType, setNewType] = useState<TypeaheadOption | null>(null);
  const [creating, setCreating] = useState(false);

  /* =========================
     Inline edit
  ========================= */
  const [editId, setEditId] = useState<number | null>(null);
  const [editTag, setEditTag] = useState("");
  const [editType, setEditType] = useState<TypeaheadOption | null>(null);
  const [saving, setSaving] = useState(false);

  /* =========================
     Fetch tags
  ========================= */
  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(limit));
        params.set("sort", sort);

        if (tagQ) params.set("q", tagQ);
        if (typeQ) params.set("type", typeQ);

        const res = await fetch(`/api/tags?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok) {
          console.error("API error:", json?.error);
          setRows([]);
          setTotal(0);
        } else {
          setRows(json.data || []);
          setTotal(json.total || 0);
        }
      } catch (e) {
        console.error("Network error:", e);
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setEditId(null);
      }
    };

    fetchTags();
  }, [page, limit, sort, tagQ, typeQ]);

  /* =========================
     Actions
  ========================= */
  async function createTag() {
    const tag = normalizeSlug(newTag);
    const type = normalizeSlug(newType?.label || "custom") || "custom";
    if (!tag) return alert("Tag is required");

    setCreating(true);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      setNewTag("");
      setNewType(null);

      await refreshTypes(); // NEW: ensures new types appear immediately
      setPage(1);
    } catch (e: any) {
      alert(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(r: TagRow) {
    setEditId(r.id);
    setEditTag(r.tag);
    setEditType({ id: r.id, label: r.type });
  }

  function cancelEdit() {
    setEditId(null);
    setEditTag("");
    setEditType(null);
  }

  async function saveEdit() {
    if (editId == null) return;
    const tag = normalizeSlug(editTag);
    const type = normalizeSlug(editType?.label || "custom") || "custom";
    if (!tag) return alert("Tag cannot be empty");

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tags/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");

      cancelEdit();
      await refreshTypes(); // NEW
      setPage((p) => p); // refresh list
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(id: number) {
    if (!confirm("Delete this tag?")) return;

    try {
      const res = await fetch(`/api/admin/tags/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Delete failed");

      await refreshTypes(); // NEW (in case we deleted last tag of a type)

      if (rows.length === 1 && page > 1) setPage(page - 1);
      else setPage((p) => p);
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    }
  }

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Manage tags</h1>

      {/* Create */}
      <div className="admin-card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Create tag</h2>

        <div className="admin-grid-3">
          <div>
            <label className="admin-label">Tag</label>
            <input className="admin-input" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="e.g. tiger" />
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Normalized: <b>{newTag ? normalizeSlug(newTag) : "—"}</b>
            </div>
          </div>

          <div>
            <label className="admin-label">Type</label>
			<TypeaheadSelect
			  options={typeOptions}
			  value={newType}
			  onChange={setNewType}
			  placeholder="e.g. animals"
			  inputClassName="admin-input"
			  minChars={1}
			  allowCreate
			/>

            <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Default: <b>custom</b>
            </div>
          </div>

          <div className="admin-actions" style={{ justifyContent: "flex-end" }}>
            <button className="button" type="button" onClick={createTag} disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>

      {/* Pager + Filters (Caps theme) */}
      <div className="pager">
        <div className="filters-bar">
          <div className="filters-active">
            {(tagQ || typeQ) ? (
              <>
                <span className="muted">Active filters:</span>
                {tagQ && <span className="chip">Tag: {tagQ}</span>}
                {typeQ && <span className="chip">Type: {typeQ}</span>}
              </>
            ) : (
              <span className="muted">No filters</span>
            )}
          </div>

          <button className="linklike" type="button" onClick={clearAll} disabled={!tagFilter && !typeFilter && sort === "id_desc"}>
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

      {/* Table (Caps theme) */}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>ID</th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("tag")}>
                  Tag <span className="th-icon">{sortIcon("tag")}</span>
                </button>

                <div className="th-filter">
                  <input className="th-input" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="filter (min 2)…" />
                  {tagFilter && (
                    <button className="th-clear" type="button" onClick={() => setTagFilter("")} aria-label="Clear tag filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("type")}>
                  Type <span className="th-icon">{sortIcon("type")}</span>
                </button>

                <div className="th-filter">
                  <input className="th-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="filter (min 2)…" />
                  {typeFilter && (
                    <button className="th-clear" type="button" onClick={() => setTypeFilter("")} aria-label="Clear type filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            <th style={{ width: 260 }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No tags found.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const isEditing = editId === r.id;

              return (
                <tr key={r.id}>
                  <td className="muted">{r.id}</td>

                  <td>{isEditing ? <input className="th-input" value={editTag} onChange={(e) => setEditTag(e.target.value)} /> : r.tag}</td>

                  <td>
                    {isEditing ? (
						<TypeaheadSelect
						  options={typeOptions}
						  value={editType}
						  onChange={setEditType}
						  placeholder="custom"
						  inputClassName="th-input"
						  minChars={1}
						  allowCreate
						/>

                    ) : (
                      <span className="muted">{r.type}</span>
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="button" type="button" onClick={saveEdit} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button className="button" type="button" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="button" type="button" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button className="button" type="button" onClick={() => deleteTag(r.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </main>
  );
}
