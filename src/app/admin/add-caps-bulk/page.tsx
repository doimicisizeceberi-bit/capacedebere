"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
  caps_count: number;
};

type SourceRow = {
  id: number;
  source_name: string;
  is_trader: boolean;
  source_country: {
    country_name_full: string;
    country_name_abb: string;
  } | null;
};

const TRADE_TYPES = [
  "blind_trade",
  "exotic_trade",
  "scan_trade",
  "blind_ro",
  "scan_ro",
] as const;

type Status = "invalid" | "pending" | "valid";

type CapRow = {
  rowId: number;
  beer_id: number;
  country: TypeaheadOption | null;
  source: TypeaheadOption | null;
  beer_name: string;
  cap_no: number;
  cap_no_manual: boolean;
  sheet: string;
  trade_type: (typeof TRADE_TYPES)[number];
  issued_year: string;
  entry_date: string;
  status: Status;
  errors: string[];
};

export default function BulkAddCapsPage() {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [rows, setRows] = useState<CapRow[]>([]);
  const [baseId, setBaseId] = useState<number>(1);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const MAX_ROWS = 50;

  const debounceRef = useRef<number | null>(null);
  const validationRunId = useRef(0);

  useEffect(() => {
    fetch("/api/countries-caps", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCountries(j.data || []));
  }, []);

  useEffect(() => {
    supabase
      .from("caps_sources")
      .select(
        `id, source_name, is_trader, source_country (country_name_full, country_name_abb)`
      )
      .order("source_name")
      .then(({ data }) => setSources((data as any) || []));
  }, []);

  useEffect(() => {
    supabase
      .from("beer_caps")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .then(({ data }) => setBaseId((data?.[0]?.id ?? 0) + 1));
  }, []);

  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id,
        label: c.country_name_full,
        meta: `${c.country_name_abb} — ${c.caps_count ?? 0}`,
      })),
    [countries]
  );

  const sourceOptions = useMemo(
    () =>
      sources.map((s) => ({
        id: s.id,
        label: s.source_name,
        meta: `${s.source_country?.country_name_abb ?? "—"} — ${
          s.source_country?.country_name_full ?? "—"
        }${s.is_trader ? " — Trader" : ""}`,
      })),
    [sources]
  );

  const createRow = (i: number): CapRow => ({
    rowId: i + 1,
    beer_id: baseId + i,
    country: null,
    source: null,
    beer_name: "",
    cap_no: 1,
    cap_no_manual: false,
    sheet: "",
    trade_type: "scan_trade",
    issued_year: "",
    entry_date: "",
    status: "invalid",
    errors: [],
  });

  const reindexRows = (list: CapRow[]) =>
    list.map((r, i) => ({ ...r, rowId: i + 1, beer_id: baseId + i }));

  const addRows = (n: number) =>
    setRows((p) =>
      reindexRows([...p, ...Array.from({ length: Math.min(n, MAX_ROWS - p.length) }, (_, i) => createRow(p.length + i))])
    );

  const removeRow = (id: number) =>
    setRows((p) => reindexRows(p.filter((r) => r.rowId !== id)));

  const validateRows = (list: CapRow[]) => {
    const out = list.map((r) => {
      const errors: string[] = [];
      if (!r.country) errors.push("Missing country");
      if (!r.source) errors.push("Missing source");
      if (!r.beer_name.trim()) errors.push("Missing beer name");
      if (!Number.isInteger(r.cap_no) || r.cap_no < 1) errors.push("Invalid cap_no");
      if (r.issued_year && !/^\d{4}$/.test(r.issued_year)) errors.push("Invalid year");
      if (r.entry_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.entry_date)) errors.push("Invalid date");
      return { ...r, errors, status: (errors.length ? "invalid" : "pending") as Status };
    });

    const map = new Map<string, number[]>();
    out.forEach((r) => {
      if (!r.country || !r.beer_name.trim()) return;
      const key = `${r.country.id}|${r.beer_name.trim().toLowerCase()}|${r.cap_no}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r.rowId);
    });

    for (const ids of map.values()) {
      if (ids.length > 1) {
        ids.forEach((id) => {
          const row = out.find((x) => x.rowId === id)!;
          row.errors.push(`Duplicate in table (${ids.join(", ")})`);
          row.status = "invalid";
        });
      }
    }

    return out;
  };

		const handleUpdate = (rowId: number, patch: Partial<CapRow>) => {
		  setRows((prev) => {
			const updated = prev.map((r) =>
			  r.rowId === rowId ? { ...r, ...patch } : r
			);

			return validateRows(updated);
		  });
		};


						const copyDown = (field: "country" | "source" | "beer_name" | "sheet" | "trade_type") => {
						  setRows((prev) => {
							if (!prev.length) return prev;

							const first = prev[0];

							const updated = prev.map((row, index) => {
							  if (index === 0) return row;

							  if (field === "country") {
								return {
								  ...row,
								  country: first.country,
								  cap_no_manual: false,
								};
							  }

							  if (field === "source") {
								return {
								  ...row,
								  source: first.source,
								};
							  }

							  if (field === "beer_name") {
								return {
								  ...row,
								  beer_name: first.beer_name,
								  cap_no_manual: false,
								};
							  }

							  if (field === "sheet") {
								return {
								  ...row,
								  sheet: first.sheet,
								};
							  }
									if (field === "trade_type") {
									  return {
										...row,
										trade_type: first.trade_type,
									  };
									}
							  return row;
							});

							return validateRows(updated);
						  });
						};

										const duplicateFromAbove = (rowId: number) => {
										  setRows((prev) => {
											const index = prev.findIndex((r) => r.rowId === rowId);
											if (index <= 0) return prev; // no row above

											const above = prev[index - 1];

											const updated = prev.map((row, i) => {
											  if (i !== index) return row;

											  return {
												...row,
												country: above.country,
												source: above.source,
												beer_name: above.beer_name,
												sheet: above.sheet,
												trade_type: above.trade_type,
												issued_year: above.issued_year,
												entry_date: above.entry_date,

												// important
												cap_no: above.cap_no,
												cap_no_manual: false,
											  };
											});

											return validateRows(updated);
										  });
										};


				const recalculateCapNos = async () => {
				  const grouped = new Map<string, number[]>();

				  rows.forEach((r, idx) => {
					if (!r.country || !r.beer_name.trim()) return;

					const key = `${r.country.id}|${r.beer_name.trim().toLowerCase()}`;

					if (!grouped.has(key)) grouped.set(key, []);
					grouped.get(key)!.push(idx);
				  });

				  const updates: number[] = Array(rows.length).fill(1);

				  for (const [key, indexes] of grouped.entries()) {
					const [countryId, beerName] = key.split("|");

					const { data } = await supabase
					  .from("beer_caps")
					  .select("cap_no")
					  .eq("cap_country", Number(countryId))
					  .eq("beer_name", beerName)
					  .order("cap_no", { ascending: false })
					  .limit(1);

					const dbMax = data?.[0]?.cap_no ?? 0;

					let current = dbMax + 1;

					indexes.forEach((rowIndex) => {
					  updates[rowIndex] = current;
					  current++;
					});
				  }

				  setRows((prev) =>
					validateRows(
					  prev.map((r, i) => ({
						...r,
						cap_no: updates[i],
						cap_no_manual: false,
					  }))
					)
				  );
				};

		const tradeMeta = (t: string) => {
		  switch (t) {
			case "scan_trade":
			  return { icon: "🔍", label: "Scan" };
			case "blind_trade":
			  return { icon: "🎲", label: "Blind" };
			case "exotic_trade":
			  return { icon: "🌴", label: "Exotic" };
			case "scan_ro":
			  return { icon: "🇷🇴🔍", label: "RO Scan" };
			case "blind_ro":
			  return { icon: "🇷🇴🎲", label: "RO Blind" };
			default:
			  return { icon: "?", label: t };
		  }
		};




  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!rows.some((r) => r.status === "pending")) return;

    debounceRef.current = window.setTimeout(async () => {
      const runId = ++validationRunId.current;

      const payload = rows.map((r, i) => ({
        index: i,
        cap_country: r.country?.id,
        beer_name: r.beer_name.trim(),
        cap_no: r.cap_no,
      }));

      const res = await fetch("/api/admin/validate-caps-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });

      const json = await res.json();
      if (runId !== validationRunId.current) return;

      const conflicts = new Set((json.conflicts || []).map((c: any) => c.index));

      setRows((prev) =>
        prev.map((r, i) => {
          if (r.status !== "pending") return r;
          if (conflicts.has(i)) {
            return { ...r, status: "invalid", errors: [...r.errors, "Already exists in DB"] };
          }
          return { ...r, status: "valid" };
        })
      );
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rows]);

  const allValid = rows.length > 0 && rows.every((r) => r.status === "valid");

  // ---------------- SUBMIT ----------------

  const onSubmit = async () => {
    setMsg("");

    if (!allValid) {
      setMsg("Fix all rows before submitting.");
      return;
    }

    setBusy(true);

    try {
      const payload = rows.map((r) => ({
        beer_name: r.beer_name.trim(),
        cap_no: r.cap_no,
        cap_country: r.country!.id,
        sheet: r.sheet || null,
        trade_type: r.trade_type,
        issued_year: r.issued_year ? Number(r.issued_year) : null,
        source: r.source!.id,
        entry_date: r.entry_date || null,
      }));

      const res = await fetch("/api/admin/add-caps-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caps: payload }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(json?.error || "Insert failed.");
        return;
      }

      setMsg("✅ Caps added successfully!");
      setRows([]);
    } catch (e) {
      setMsg("Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

const icon = (s: Status) =>
  s === "valid" ? "🟢" : s === "pending" ? "🟡" : "🔴";

return (
  <>
    <h1 className="h1-display">📦 Bulk-adding caps</h1>

    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
      <button className="button" onClick={() => addRows(1)}>+1</button>
      <button className="button" onClick={() => addRows(5)}>+5</button>
      <div className="muted">{rows.length} / {MAX_ROWS}</div>
    </div>

    <div style={{ overflowX: "auto" }}>
  <table className="table" style={{ tableLayout: "fixed" }}>
    <thead>
      <tr>
        <th style={{ width: 36 }}>#</th>
        <th style={{ width: 60 }}>ID</th>

        <th style={{ width: 190 }}>
          Country
          <button className="button" style={{ marginLeft: 4 }} onClick={() => copyDown("country")}>↓</button>
        </th>

        <th style={{ width: 170, fontSize: 12 }}>
          Source
          <button className="button" style={{ marginLeft: 4 }} onClick={() => copyDown("source")}>↓</button>
        </th>

        <th style={{ width: 190 }}>
          Beer
          <button className="button" style={{ marginLeft: 4 }} onClick={() => copyDown("beer_name")}>↓</button>
        </th>

        <th
          style={{ width: 60, color: "crimson", cursor: "pointer" }}
          onClick={recalculateCapNos}
          title="Recalculate cap numbers"
        >
          Cap no
        </th>

        <th style={{ width: 85 }}>
          Sheet
          <button className="button" style={{ marginLeft: 4 }} onClick={() => copyDown("sheet")}>↓</button>
        </th>

		<th style={{ width: 100, textAlign: "center" }}>
		  Trade
		  <button
			className="button"
			style={{ marginLeft: 4 }}
			onClick={() => copyDown("trade_type")}
		  >
			↓
		  </button>
		</th>

        <th style={{ width: 60 }}>Year</th>
        <th style={{ width: 110, fontSize: 12 }}>Entry</th>

        <th style={{ width: 40 }}></th>
        <th style={{ width: 40 }}></th>
      </tr>
    </thead>

    <tbody>
      {rows.map((r) => (
        <tr key={r.rowId}>
          
          {/* # column (duplicate via click) */}
          <td style={{ textAlign: "center" }}>
            {r.rowId === 1 ? (
              r.rowId
            ) : (
              <button
                className="button"
                style={{ padding: "0 4px", fontSize: 12 }}
                onClick={() => duplicateFromAbove(r.rowId)}
                title="Copy from above"
              >
                {r.rowId}
              </button>
            )}
          </td>

          {/* ID */}
          <td style={{ fontSize: 12 }}>{r.beer_id}</td>

          {/* Country */}
          <td>
            <TypeaheadSelect
              options={countryOptions}
              value={r.country}
              onChange={(v) =>
                handleUpdate(r.rowId, { country: v })
              }
              inputClassName="select"
            />
          </td>

          {/* Source (smaller) */}
          <td style={{ fontSize: 10 }}>
            <div style={{ width: 170 }}>
			<TypeaheadSelect
              options={sourceOptions}
              value={r.source}
              onChange={(v) =>
                handleUpdate(r.rowId, { source: v })
              }
              inputClassName="select"
            />
			</div>
          </td>

          {/* Beer */}
          <td>
            <input
              className="input"
              value={r.beer_name}
              onChange={(e) =>
                handleUpdate(r.rowId, { beer_name: e.target.value })
              }
            />
          </td>

          {/* Cap no */}
          <td>
            <input
              className="input"
              style={{ width: 55 }}
              type="number"
              value={r.cap_no}
              onChange={(e) =>
                handleUpdate(r.rowId, {
                  cap_no: Number(e.target.value),
                  cap_no_manual: true,
                })
              }
            />
          </td>

          {/* Sheet */}
          <td>
            <input
              className="input"
              style={{ width: 75 }}
              value={r.sheet}
              onChange={(e) =>
                handleUpdate(r.rowId, { sheet: e.target.value })
              }
            />
          </td>

          {/* Trade (icon dropdown) */}
          <td style={{ textAlign: "center" }}>
            <select
              className="select"
              style={{ fontSize: 12, textAlign: "center" }}
              value={r.trade_type}
              onChange={(e) =>
                handleUpdate(r.rowId, {
                  trade_type: e.target.value as any,
                })
              }
            >
              {TRADE_TYPES.map((t) => {
                const meta = tradeMeta(t);
                return (
                  <option key={t} value={t}>
                    {meta.icon} {meta.label}
                  </option>
                );
              })}
            </select>
          </td>

          {/* Year */}
          <td>
            <input
              className="input"
              style={{ width: 55, textAlign: "center" }}
              value={r.issued_year}
              onChange={(e) =>
                handleUpdate(r.rowId, { issued_year: e.target.value })
              }
            />
          </td>

          {/* Entry */}
          <td>
            <input
              className="input"
              style={{ width: 105, fontSize: 12 }}
              placeholder="YYYY-MM-DD"
              value={r.entry_date}
              onChange={(e) =>
                handleUpdate(r.rowId, { entry_date: e.target.value })
              }
            />
          </td>

          {/* Delete */}
          <td>
            <button
              className="button"
              onClick={() => removeRow(r.rowId)}
            >
              ❌
            </button>
          </td>

          {/* Status (no header text) */}
          <td title={r.errors.join("\n")}>
            {icon(r.status)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

    <div style={{ marginTop: 16 }}>
      <button
        className="button"
        onClick={onSubmit}
        disabled={!allValid || busy}
      >
        {busy ? "Saving..." : "Add caps"}
      </button>

      {msg && (
        <div style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
    </div>
  </>
);
}