"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import React from "react";

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

  entry_date?: string | null;
  issued_year?: number | null;

  beer_caps_tags?: { tags: { tag: string } | null }[] | null;
};

export default function CapsMobilePage() {
  const [caps, setCaps] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    const fetchCaps = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort", "id_desc");

      const res = await fetch(`/api/caps?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      setCaps(json.data || []);
      setTotal(json.total || 0);
      setLoading(false);
    };

    fetchCaps();
  }, [page]);

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1 className="h1-display">📱 Beer Caps Mobile</h1>

      <div className="mobile-list">
        {caps.map((cap) => {
          const photoPath = cap.photo_caps?.photo_path;
          const imageUrl = photoPath
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${photoPath}`
            : null;

          const tagList =
            cap.beer_caps_tags?.map((x) => x.tags?.tag).filter(Boolean) ?? [];

          return (
            <div key={cap.id} className="mobile-card">
              {imageUrl ? (
                <img className="mobile-image" src={imageUrl} alt="cap" />
              ) : (
                <div className="mobile-image placeholder">No photo</div>
              )}

              <div className="mobile-content">
                <div className="mobile-title">
                  {cap.beer_name}
                </div>

                <div className="mobile-row">
                  <b>Cap:</b> {cap.cap_no}
                </div>

                <div className="mobile-row">
                  <b>Country:</b> {cap.caps_country?.country_name_full ?? "-"}
                </div>

                <div className="mobile-row">
                  <b>Sheet:</b> {cap.sheet ?? "-"}
                </div>

                <div className="mobile-tags">
                  {tagList.map((t) => (
                    <span key={t} className="pill">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pager-mobile">
        <button
          className="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>

        <span>
          Page {page} / {Math.max(1, Math.ceil(total / limit))}
        </span>

        <button
          className="button"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}