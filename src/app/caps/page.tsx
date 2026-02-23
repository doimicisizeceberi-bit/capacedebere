"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import React from "react";


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


export default function CapsPage() {
	
	
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
	  if (col === "beer") return sort === "beer_name_asc" ? "▲" : sort === "beer_name_desc" ? "▼" : "";
	  if (col === "country") return sort === "country_asc" ? "▲" : sort === "country_desc" ? "▼" : "";
	  return sort === "sheet_asc" ? "▲" : sort === "sheet_desc" ? "▼" : "";
	};

	const clearAll = () => {
	  setBeerFilter("");
	  setCountryFilter("");
	  setSheetFilter("");
	  setSort("id_desc");
	  setPage(1);
	};

	
	const [sort, setSort] = useState<
	  "id_desc" |
	  "beer_name_asc" | "beer_name_desc" |
	  "country_asc" | "country_desc" |
	  "sheet_asc" | "sheet_desc"
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
	const [loading, setLoading] = useState(true);
	  
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

		useEffect(() => {
		  const t = window.setTimeout(() => {
			const b = beerFilter.trim();
			const c = countryFilter.trim();
			const s = sheetFilter.trim();

			setBeerQ(b.length >= 3 ? b : "");
			setCountryQ(c.length >= 2 ? c : "");
			setSheetQ(s.length >= 3 ? s : "");

			setPage(1); // filters changed => go back to first page
		  }, 250);

		  return () => window.clearTimeout(t);
		}, [beerFilter, countryFilter, sheetFilter]);


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
		}, [page, limit, sort, beerQ, countryQ, sheetQ]);


  
  //full size thumb
  
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setPreviewUrl(null);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);


  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Beer Caps</h1>

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

		  <button className="linklike" type="button" onClick={clearAll} disabled={!beerFilter && !countryFilter && !sheetFilter && sort === "id_desc"}>
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

		<table className="table">

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
					  <span className={`chevron ${isOpen ? "open" : ""}`}>
						▶
					  </span>
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
						  e.stopPropagation(); // prevents expanding/collapsing the row
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
