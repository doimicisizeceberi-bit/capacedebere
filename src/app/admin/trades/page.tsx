"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type Trader = {
  id: number;
  name: string;
  country_id: number;
  details: string | null;
};

type Trade = {
  id: number;
  status: "pending" | "canceled" | "completed";
  trade_type: "blind" | "scan_based";
  date_started: string;
  date_canceled: string | null;
  date_completed: string | null;
  notes: string | null;
  trader: { id: number; name: string; country_id: number | null } | null;

  caps_count: number;

  // NEW (for the extra column)
  trader_country_name: string | null;
};

const STATUSES: Array<Trade["status"]> = ["pending", "completed", "canceled"];

export default function TradesPage() {
  /* =========================
     Country ABB map (for trader picker meta)
  ========================= */
  const [countryAbbById, setCountryAbbById] = useState<Record<number, string>>({});

  async function loadCountriesAbb() {
    const res = await fetch("/api/countries", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) return;

    const map: Record<number, string> = {};
    (json.data ?? []).forEach((c: any) => {
      map[Number(c.id)] = String(c.country_name_abb);
    });
    setCountryAbbById(map);
  }

  /* =========================
     Sort (date + caps + country)
  ========================= */
  const [sort, setSort] = useState<
    | "date_started_desc"
    | "date_started_asc"
    | "caps_count_desc"
    | "caps_count_asc"
    | "country_asc"
    | "country_desc"
  >("date_started_desc");

  const toggleSort = (col: "date" | "caps" | "country") => {
    setPage(1);
    setSort((prev) => {
      if (col === "date") return prev === "date_started_desc" ? "date_started_asc" : "date_started_desc";
      if (col === "caps") return prev === "caps_count_desc" ? "caps_count_asc" : "caps_count_desc";
      return prev === "country_asc" ? "country_desc" : "country_asc";
    });
  };

  const sortIcon = (col: "date" | "caps" | "country") => {
    if (col === "date") return sort === "date_started_asc" ? "▲" : sort === "date_started_desc" ? "▼" : "";
    if (col === "caps") return sort === "caps_count_asc" ? "▲" : sort === "caps_count_desc" ? "▼" : "";
    return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
  };

  /* =========================
     Create trade form (TypeaheadSelect trader)
  ========================= */
  const [traders, setTraders] = useState<Trader[]>([]);

  const [trader, setTrader] = useState<TypeaheadOption | null>(null);
  const traderId = trader?.id ?? null;

  const [tradeType, setTradeType] = useState<"scan_based" | "blind">("scan_based");
  const [notes, setNotes] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string>("");

  const canCreate = useMemo(() => Number.isInteger(traderId) && (traderId ?? 0) > 0, [traderId]);

  const traderOptions: TypeaheadOption[] = useMemo(() => {
    return (traders ?? []).map((t) => ({
      id: t.id,
      label: t.name,
      meta: countryAbbById[t.country_id] ?? "—",
    }));
  }, [traders, countryAbbById]);

  async function loadTraders() {
    const res = await fetch("/api/admin/traders/list?limit=200", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setTraders(json.traders ?? []);
  }

  async function createTrade() {
    if (!canCreate || createBusy) return;

    setCreateBusy(true);
    setCreateMsg("");

    try {
      const res = await fetch("/api/admin/trades/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader_id: traderId,
          trade_type: tradeType,
          notes: notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateMsg(json?.error || "Create failed");
        return;
      }

      setCreateMsg(`Created pending trade #${json.trade?.id}`);
      setNotes("");
      await loadTrades();
    } catch (e: any) {
      setCreateMsg(e?.message ?? "Network error");
    } finally {
      setCreateBusy(false);
    }
  }

  /* =========================
     List + Filters + Pager
  ========================= */
  const [status, setStatus] = useState<Trade["status"]>("pending");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listMsg, setListMsg] = useState<string>("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(50);
  const [total, setTotal] = useState(0);

  // filters
  const [traderFilter, setTraderFilter] = useState("");
  const [traderQ, setTraderQ] = useState("");

  const [countryFilter, setCountryFilter] = useState("");
  const [countryQ, setCountryQ] = useState("");

  const [typeFilter, setTypeFilter] = useState<"" | "blind" | "scan_based">("");
  const typeQ = typeFilter;

  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = traderFilter.trim();
      setTraderQ(q.length >= 2 ? q : "");
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [traderFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = countryFilter.trim();
      setCountryQ(q.length >= 2 ? q : "");
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [countryFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const clearAll = () => {
    setTraderFilter("");
    setTraderQ("");
    setCountryFilter("");
    setCountryQ("");
    setTypeFilter("");
    setSort("date_started_desc");
    setPage(1);
  };

  async function loadTrades() {
    setListBusy(true);
    setListMsg("");

    try {
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort", sort);
      if (traderQ) params.set("trader", traderQ);
      if (countryQ) params.set("country", countryQ);
      if (typeQ) params.set("type", typeQ);

      const res = await fetch(`/api/admin/trades/list?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setListMsg(json?.error || "Failed to load trades");
        setTrades([]);
        setTotal(0);
        return;
      }

      setTrades(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setListMsg(e?.message ?? "Network error");
      setTrades([]);
      setTotal(0);
    } finally {
      setListBusy(false);
    }
  }

  useEffect(() => {
    loadTraders();
    loadCountriesAbb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, limit, sort, traderQ, countryQ, typeQ]);

  /* =========================
     Actions (unchanged)
  ========================= */
  async function cancelTrade(tradeId: number) {
    const ok = window.confirm(`Cancel trade #${tradeId}? This releases all reserved caps.`);
    if (!ok) return;

    const res = await fetch("/api/admin/trades/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade_id: tradeId }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || "Cancel failed");
      return;
    }
    await loadTrades();
  }

  async function completeTrade(tradeId: number) {
    const ok = window.confirm(`Complete trade #${tradeId}? This will trade out all reserved caps.`);
    if (!ok) return;

    const res = await fetch("/api/admin/trades/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade_id: tradeId }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || "Complete failed");
      return;
    }
    await loadTrades();
  }

  return (
    <>
      <h1>Trades</h1>

      {/* Create trade */}
      <div className="form" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Create pending trade</label>

          <div className="actions" style={{ alignItems: "center" }}>
            {/* Trader (TypeaheadSelect) */}
            <div style={{ position: "relative" }}>
              <TypeaheadSelect
                options={traderOptions}
                value={trader}
                onChange={(opt) => setTrader(opt)}
                placeholder="Type trader (min 2)…"
                minChars={2}
                maxResults={12}
                inputClassName="pager-select"
              />
              {createBusy && (
                <div style={{ position: "absolute", inset: 0, cursor: "not-allowed" }} aria-hidden="true" />
              )}
            </div>

            <select
              className="pager-select"
              value={tradeType}
              onChange={(e) => setTradeType(e.target.value as any)}
              disabled={createBusy}
            >
              <option value="scan_based">scan_based</option>
              <option value="blind">blind</option>
            </select>

            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              disabled={createBusy}
              style={{ minWidth: 240 }}
            />

            <button className="button" type="button" onClick={createTrade} disabled={!canCreate || createBusy}>
              {createBusy ? "Creating..." : "Create"}
            </button>
          </div>

          {createMsg && (
            <div
              className="help"
              style={{
                marginTop: 8,
                color: createMsg.toLowerCase().includes("created") ? "green" : "crimson",
              }}
            >
              {createMsg}
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: "24px 0", borderTop: "1px solid #e5e7eb" }} />

      {/* Status buttons */}
      <div className="actions" style={{ marginBottom: 10, alignItems: "center" }}>
        <span className="pager-label">Show</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="button"
            onClick={() => setStatus(s)}
            disabled={listBusy}
            style={{ opacity: status === s ? 1 : 0.65 }}
          >
            {s}
          </button>
        ))}
        {listBusy && <span className="help">Loading…</span>}
        {listMsg && <span className="help" style={{ color: "crimson" }}>{listMsg}</span>}
      </div>

      {/* Filters bar */}
      <div className="filters-bar" style={{ marginBottom: 10 }}>
        <div className="filters-active">
          {(traderQ || countryQ || typeQ) ? (
            <>
              <span className="muted">Active filters:</span>
              {traderQ && <span className="chip">Trader: {traderQ}</span>}
              {countryQ && <span className="chip">Country: {countryQ}</span>}
              {typeQ && <span className="chip">Type: {typeQ}</span>}
            </>
          ) : (
            <span className="muted">No filters</span>
          )}
        </div>

        <button
          className="linklike"
          type="button"
          onClick={clearAll}
          disabled={!traderFilter && !countryFilter && !typeFilter && sort === "date_started_desc"}
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

      {/* Trades table */}
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>

            <th>
              <div className="th-wrap">
                <div style={{ fontWeight: 800 }}>Trader</div>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={traderFilter}
                    onChange={(e) => setTraderFilter(e.target.value)}
                    placeholder="filter (min 2)…"
                    disabled={listBusy}
                  />
                  {traderFilter && (
                    <button className="th-clear" type="button" onClick={() => setTraderFilter("")} aria-label="Clear trader filter">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </th>

            <th>
              <div className="th-wrap">
                <button className="th-sort" type="button" onClick={() => toggleSort("country")} disabled={listBusy}>
                  Country <span className="th-icon">{sortIcon("country")}</span>
                </button>
                <div className="th-filter">
                  <input
                    className="th-input"
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    placeholder="filter (min 2)…"
                    disabled={listBusy}
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
                <div style={{ fontWeight: 800 }}>Type</div>
                <div className="th-filter">
                  <select
                    className="th-input"
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value as any);
                      setPage(1);
                    }}
                    disabled={listBusy}
                  >
                    <option value="">all</option>
                    <option value="scan_based">scan_based</option>
                    <option value="blind">blind</option>
                  </select>
                </div>
              </div>
            </th>

            <th>
              <button className="th-sort" type="button" onClick={() => toggleSort("date")} disabled={listBusy}>
                Started <span className="th-icon">{sortIcon("date")}</span>
              </button>
            </th>

            <th>
              <button className="th-sort" type="button" onClick={() => toggleSort("caps")} disabled={listBusy}>
                Caps <span className="th-icon">{sortIcon("caps")}</span>
              </button>
            </th>

            <th>Status</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.trader?.name ?? "-"}</td>
              <td>{t.trader_country_name ?? "-"}</td>
              <td>{t.trade_type}</td>
              <td>{t.date_started ? new Date(t.date_started).toLocaleString() : "-"}</td>
              <td>{t.caps_count ?? 0}</td>
              <td>{t.status}</td>
              <td style={{ textAlign: "right" }}>
                <div className="actions" style={{ justifyContent: "flex-end" }}>
                  <a className="button" href={`/admin/trades/${t.id}`}>
                    Open
                  </a>

                  {t.status === "pending" ? (
                    <>
                      <button className="button" type="button" onClick={() => cancelTrade(t.id)} disabled={listBusy}>
                        Cancel
                      </button>
                      <button className="button" type="button" onClick={() => completeTrade(t.id)} disabled={listBusy}>
                        Complete
                      </button>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {trades.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No trades in this list.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }} className="help">
        Tip: pending trades are editable; completed/canceled are read-only.
      </div>
    </>
  );
}
