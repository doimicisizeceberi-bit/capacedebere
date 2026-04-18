"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";

type CapRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;

  photo_caps: { photo_path: string } | null;

  caps_country: {
    country_name_full: string;
    iso2?: string | null;
  } | null;
};

export default function CapsQuickViewPage() {
  const searchParams = useSearchParams();

  const [beerFilter, setBeerFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");

  const [beerQ, setBeerQ] = useState("");
  const [countryQ, setCountryQ] = useState("");
  const [sheetQ, setSheetQ] = useState("");

  const [mapIso2, setMapIso2] = useState<string>(
    searchParams?.get("map_iso2") ?? ""
  );

  const [page, setPage] = useState(1);
  const limit = 100;

  const [total, setTotal] = useState(0);
  const [caps, setCaps] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const clearAll = () => {
    setBeerFilter("");
    setCountryFilter("");
    setSheetFilter("");
    setBeerQ("");
    setCountryQ("");
    setSheetQ("");
    setMapIso2("");
    setPage(1);
  };

  // debounce filters
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

  // fetch
  useEffect(() => {
    const fetchCaps = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "100");
        params.set("sort", "id_desc");

        if (beerQ) params.set("beer", beerQ);
        if (countryQ) params.set("country", countryQ);
        if (sheetQ) params.set("sheet", sheetQ);
        if (mapIso2) params.set("map_iso2", mapIso2);

        const res = await fetch(`/api/caps?${params.toString()}`, {
          cache: "no-store",
        });

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
      }
    };

    fetchCaps();
  }, [page, beerQ, countryQ, sheetQ, mapIso2]);

  // ESC closes preview
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
      <h1 className="h1-display">⚡ Caps Quick View</h1>

      {/* TOP BAR */}
      <div className="pager">
        <div className="filters-bar">
          <div className="filters-active">
            {beerQ || countryQ || sheetQ || mapIso2 ? (
              <>
                <span className="muted">Active filters:</span>
                {mapIso2 && <span className="chip">Map ISO2: {mapIso2}</span>}
                {beerQ && <span className="chip">Beer: {beerQ}</span>}
                {countryQ && (
                  <span className="chip">Country: {countryQ}</span>
                )}
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
            disabled={
              !beerFilter &&
              !countryFilter &&
              !sheetFilter &&
              !mapIso2
            }
          >
            Clear all
          </button>
        </div>

        {/* FILTER INPUTS */}
		<div
		  style={{
			display: "grid",
			gridTemplateColumns: "1fr 1fr 1fr",
			gap: 8,
			marginTop: 8,
		  }}
		>
          <input
            className="th-input"
            value={beerFilter}
            onChange={(e) => setBeerFilter(e.target.value)}
            placeholder="Beer (min 3)…"
          />

          <input
            className="th-input"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            placeholder="Country (min 2)…"
          />

          <input
            className="th-input"
            value={sheetFilter}
            onChange={(e) => setSheetFilter(e.target.value)}
            placeholder="Sheet (min 3)…"
          />
        </div>

        {/* PAGINATION */}
        <div className="pager-right" style={{ marginTop: 10 }}>
          <button
            className="button"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>

          <span className="pager-info">
            Page <b>{page}</b> /{" "}
            <b>{Math.max(1, Math.ceil(total / limit))}</b>
          </span>

          <button
            className="button"
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / limit)}
          >
            Next
          </button>

          <span className="pager-info" style={{ marginLeft: 12 }}>
            Total: <b>{total}</b>
          </span>
        </div>
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
          gap: 8,
          marginTop: 16,
        }}
      >
        {caps.map((cap) => {
          const photoPath = cap.photo_caps?.photo_path;
          const imageUrl = photoPath
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${photoPath}`
            : null;

          const iso = cap.caps_country?.iso2?.toLowerCase();

          return (
            <div
              key={cap.id}
              style={{
                textAlign: "center",
                fontSize: 12,
              }}
            >
              {/* IMAGE */}
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="cap"
                  loading="lazy"
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    borderRadius: 6,
                    cursor: "zoom-in",
                  }}
                  onClick={() => setPreviewUrl(imageUrl)}
                />
              ) : (
                <div className="thumb-placeholder">No photo</div>
              )}

              {/* BEER NAME */}
              <div
                style={{
                  marginTop: 4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cap.beer_name}
              </div>

              {/* META */}
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                  marginTop: 2,
                }}
              >
                #{cap.cap_no}{" "}
                {iso && (
                  <img
                    src={`https://flagcdn.com/16x12/${iso}.png`}
                    alt=""
                    style={{
                      margin: "0 4px",
                      verticalAlign: "middle",
                      borderRadius: 2,
                      border: "1px solid rgba(0,0,0,0.1)",
                    }}
                  />
                )}
                | {cap.sheet ?? "-"}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {previewUrl && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setPreviewUrl(null)}
            >
              ✕
            </button>
            <img className="modal-image" src={previewUrl} />
          </div>
        </div>
      )}
    </main>
  );
}