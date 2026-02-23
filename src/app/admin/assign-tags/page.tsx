"use client";

import React, { useEffect, useState } from "react";

type CapRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;
  photo_caps: { photo_path: string } | { photo_path: string }[] | null;
  caps_country: { country_name_full: string } | null;
};

type CapTagRow = {
  beer_cap_id: number;
  tag_id: number;
  auto_generated: boolean;
  tags: { id: number; tag: string; type: string } | null;
};

type SettingMap = Record<string, string>;

type ColorSuggestion = {
  bucket: string; // e.g. "red"
  pct: number; // 0..100
  confidence: number; // 0..1
  tag_id: number | null; // mapped from tags(type=color)
};

function supabasePublicUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/beer-caps/${path}`;
}

function getPhotoPath(cap: CapRow | null): string | null {
  if (!cap?.photo_caps) return null;
  const p: any = cap.photo_caps as any;
  if (Array.isArray(p)) return p[0]?.photo_path ?? null;
  return p.photo_path ?? null;
}

// ---------- Color utils (deterministic) ----------

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

// circular stats for hues (degrees)
function circularStdDeg(hues: number[]) {
  if (hues.length < 2) return 0;

  let sumSin = 0;
  let sumCos = 0;
  for (const h of hues) {
    const rad = (h * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }
  const n = hues.length;
  const R = Math.sqrt((sumSin / n) ** 2 + (sumCos / n) ** 2);
  // circular standard deviation approximation:
  // std = sqrt(-2 ln R) in radians
  const stdRad = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(1e-9, R))));
  return (stdRad * 180) / Math.PI;
}

function bucketColor(h: number, s: number, l: number, minSat: number): string {
  // neutrals
  if (s < minSat) {
    if (l < 20) return "black";
    if (l > 90) return "white";
    if (l > 70) return "silver";
    return "gray";
  }

  // colored buckets (heuristic ranges)
  // red wraps around 0
  const isRed = h >= 345 || h < 20;
  if (isRed) {
    if (l < 40) return "burgundy";
    return "red";
  }

  // copper / brown / orange / gold / yellow
  if (h >= 20 && h < 40) {
    if (l < 35) return "brown";
    if (h < 30) return "copper";
    return "orange";
  }

  if (h >= 40 && h < 60) {
    // gold zone
    if (l >= 30 && l <= 85) return "gold";
  }

  if (h >= 55 && h < 75) return "yellow";
  if (h >= 75 && h < 160) return "green";
  if (h >= 160 && h < 200) return "turquoise";
  if (h >= 200 && h < 250) return "blue";
  if (h >= 250 && h < 300) return "purple";
  if (h >= 300 && h < 345) {
    if (l > 55) return "pink";
    return "purple";
  }

  return "gray";
}

async function computeColorSuggestions(args: {
  imageUrl: string;
  thresholdPct: number;
  minSaturationPct: number;
  sampleStep: number;
}): Promise<{ buckets: Record<string, { count: number; hues: number[] }>; total: number }> {
  const { imageUrl, minSaturationPct, sampleStep } = args;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for color scan (CORS?)"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(img, 0, 0);

  const { width: w, height: h } = canvas;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const r2 = r * r;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const buckets: Record<string, { count: number; hues: number[] }> = {};
  let total = 0;

  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w; x += sampleStep) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;

      const i = (y * w + x) * 4;
      const r0 = data[i];
      const g0 = data[i + 1];
      const b0 = data[i + 2];
      const a0 = data[i + 3];

      if (a0 < 20) continue;

      const { h: hh, s, l } = rgbToHsl(r0, g0, b0);
      const bucket = bucketColor(hh, s, l, minSaturationPct);

      if (!buckets[bucket]) buckets[bucket] = { count: 0, hues: [] };
      buckets[bucket].count += 1;
      if (s >= minSaturationPct) buckets[bucket].hues.push(hh);

      total += 1;
    }
  }

  return { buckets, total };
}

export default function AssignTagsPage() {
  // -------------------------
  // Settings
  // -------------------------
  const [settings, setSettings] = useState<SettingMap>({});
  const enableAuto = (settings.enable_auto_color_detection ?? "true") === "true";
  const thresholdPct = Number(settings.color_threshold_pct ?? "5");
  const minSatPct = Number(settings.min_saturation_pct ?? "20");

  // -------------------------
  // Cap list state
  // -------------------------
  const [sort, setSort] = useState<
    | "id_desc"
    | "beer_name_asc"
    | "beer_name_desc"
    | "country_asc"
    | "country_desc"
    | "sheet_asc"
    | "sheet_desc"
  >("id_desc");

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

  const [beerFilter, setBeerFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");

  const [beerQ, setBeerQ] = useState("");
  const [countryQ, setCountryQ] = useState("");
  const [sheetQ, setSheetQ] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 50 | 100>(10);
  const [total, setTotal] = useState(0);

  const [caps, setCaps] = useState<CapRow[]>([]);
  const [loadingCaps, setLoadingCaps] = useState(true);

  const clearAll = () => {
    setBeerFilter("");
    setCountryFilter("");
    setSheetFilter("");
    setSort("id_desc");
    setPage(1);
  };

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

  // -------------------------
  // Selected cap & tags
  // -------------------------
  const [selectedCap, setSelectedCap] = useState<CapRow | null>(null);

  const [assigned, setAssigned] = useState<CapTagRow[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

	const [manualTagIds, setManualTagIds] = useState<Set<number>>(new Set());
	const [autoTagIds, setAutoTagIds] = useState<Set<number>>(new Set());

// for UI: highlight tags added from search since last Save/load
const [justAddedManual, setJustAddedManual] = useState<Set<number>>(new Set());


  // -------------------------
  // Color tags map (bucket -> tag_id)
  // -------------------------
  const [colorTagMap, setColorTagMap] = useState<Record<string, number>>({});

  // -------------------------
  // Suggestions
  // -------------------------
  const [suggestions, setSuggestions] = useState<ColorSuggestion[]>([]);
  const [checkedAuto, setCheckedAuto] = useState<Set<number>>(new Set());
  const [scanning, setScanning] = useState(false);

  // -------------------------
  // Manual add search
  // -------------------------
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<Array<{ id: number; tag: string; type: string }>>([]);
  const [tagSearching, setTagSearching] = useState(false);

  // -------------------------
  // Load settings + color tags once
  // -------------------------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setSettings(json.map || {});
      } catch {}
    })();

    (async () => {
      try {
        const res = await fetch("/api/tags?type=color&page=1&pageSize=200&sort=tag_asc", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) return;

        const map: Record<string, number> = {};
        for (const row of json.data || []) {
          if (row?.tag && row?.id) map[row.tag] = row.id;
        }
        setColorTagMap(map);
      } catch {}
    })();
  }, []);

  // -------------------------
  // Fetch caps-with-photo list
  // -------------------------
  useEffect(() => {
    const fetchCaps = async () => {
      setLoadingCaps(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        params.set("sort", sort);
        if (beerQ) params.set("beer", beerQ);
        if (countryQ) params.set("country", countryQ);
        if (sheetQ) params.set("sheet", sheetQ);

        const res = await fetch(`/api/caps-with-photo?${params.toString()}`, { cache: "no-store" });
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
        setLoadingCaps(false);
      }
    };

    fetchCaps();
  }, [page, limit, sort, beerQ, countryQ, sheetQ]);

  // -------------------------
  // Fetch assigned tags when cap selected
  // -------------------------
  async function loadAssigned(capId: number) {
    setLoadingAssigned(true);
    try {
      const res = await fetch(`/api/cap-tags?cap_id=${capId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load cap tags");

      const rows: CapTagRow[] = json.data || [];
      setAssigned(rows);

      const man = new Set<number>();
      const aut = new Set<number>();

      for (const r of rows) {
        if (!r.tags) continue;
        if (r.auto_generated) aut.add(r.tag_id);
        else man.add(r.tag_id);
      }

      setManualTagIds(man);
      setAutoTagIds(aut);

      setCheckedAuto(new Set(aut));
	  setJustAddedManual(new Set());

    } catch (e: any) {
      alert(e?.message ?? "Failed to load cap tags");
      setAssigned([]);
      setManualTagIds(new Set());
      setAutoTagIds(new Set());
      setCheckedAuto(new Set());
    } finally {
      setLoadingAssigned(false);
    }
  }

	// -------------------------
	// Derived display helpers
	// -------------------------
	const photoPath = getPhotoPath(selectedCap);

	// derive assigned sets once
	const assignedManualIds = new Set<number>();
	const assignedAutoIds = new Set<number>();

	for (const r of assigned) {
	  if (!r.tags) continue;
	  if (r.auto_generated) assignedAutoIds.add(r.tag_id);
	  else assignedManualIds.add(r.tag_id);
	}

	function isAutoPendingRemoval(tagId: number) {
	  return assignedAutoIds.has(tagId) && !checkedAuto.has(tagId);
	}

	function isManualPendingRemoval(tagId: number) {
	  return assignedManualIds.has(tagId) && !manualTagIds.has(tagId);
	}


  // -------------------------
  // Run scan
  // -------------------------
  async function runScan() {
    if (!selectedCap) return;

    if (!enableAuto) {
      return alert("Auto color detection is disabled in Settings.");
    }

    const photoPathLocal = getPhotoPath(selectedCap);
    if (!photoPathLocal) return alert("No photo found for this cap.");

    setScanning(true);
    try {
      const imageUrl = supabasePublicUrl(photoPathLocal);

      const { buckets, total: totalSamples } = await computeColorSuggestions({
        imageUrl,
        thresholdPct,
        minSaturationPct: minSatPct,
        sampleStep: 3,
      });

      if (!totalSamples) {
        setSuggestions([]);
        return;
      }

      const out: ColorSuggestion[] = [];

      for (const [bucket, stat] of Object.entries(buckets)) {
        const pct = (stat.count / totalSamples) * 100;
        if (pct < thresholdPct) continue;

        const hueStd = circularStdDeg(stat.hues);
        const dominance = Math.min(1, pct / 100);
        const tightness = Math.max(0, 1 - hueStd / 120);
        const confidence = Math.max(0, Math.min(1, dominance * (0.6 + 0.4 * tightness)));

        out.push({
          bucket,
          pct,
          confidence,
          tag_id: colorTagMap[bucket] ?? null,
        });
      }

      out.sort((a, b) => b.pct - a.pct);

      setSuggestions(out);

      const nextChecked = new Set<number>(checkedAuto);
      for (const s of out) {
        if (s.tag_id) nextChecked.add(s.tag_id);
      }
      setCheckedAuto(nextChecked);
    } catch (e: any) {
      alert(e?.message ?? "Scan failed");
      setSuggestions([]);
    } finally {
      setScanning(false);
    }
  }

  // -------------------------
  // Save assignments
  // -------------------------
  async function save() {
    if (!selectedCap) return;

    const beer_cap_id = selectedCap.id;
    const tag_ids_auto = Array.from(checkedAuto);
    const tag_ids_manual = Array.from(manualTagIds);

    try {
      const res = await fetch("/api/admin/cap-tags/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beer_cap_id, tag_ids_auto, tag_ids_manual }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");

      await loadAssigned(beer_cap_id);
      alert("Saved.");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  }

  // -------------------------
  // Manual tag search
  // -------------------------
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const q = tagSearch.trim();
      if (q.length < 2) {
        setTagResults([]);
        return;
      }
      setTagSearching(true);
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("page", "1");
        params.set("pageSize", "12");
        params.set("sort", "tag_asc");

        const res = await fetch(`/api/tags?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          setTagResults([]);
        } else {
          setTagResults((json.data || []).map((x: any) => ({ id: x.id, tag: x.tag, type: x.type })));
        }
      } catch {
        setTagResults([]);
      } finally {
        setTagSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [tagSearch]);

  // -------------------------
  // Derived display
  // -------------------------
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const assignedManual = assigned.filter((x) => x.tags && !x.auto_generated);
  const assignedAuto = assigned.filter((x) => x.tags && x.auto_generated);

  function toggleManual(tagId: number) {
    setManualTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleAuto(tagId: number) {
    setCheckedAuto((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  return (
    <main className="page">
      <h1>Assign tags</h1>

      <div className="assign-tags-grid">
        {/* LEFT: caps list */}
        <div>
          <div className="pager">
            <div className="filters-bar">
              <div className="filters-active">
                {beerQ || countryQ || sheetQ ? (
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

              <button
                className="linklike"
                type="button"
                onClick={clearAll}
                disabled={!beerFilter && !countryFilter && !sheetFilter && sort === "id_desc"}
              >
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

          {loadingCaps ? (
            <p style={{ padding: "1rem" }}>Loading...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
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

                  <th style={{ width: 90 }}>No</th>

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
                </tr>
              </thead>

              <tbody>
                {caps.map((cap) => {
                  const isSel = selectedCap?.id === cap.id;
                  return (
                    <tr
                      key={cap.id}
                      className={`table-row-clickable ${isSel ? "row-selected" : ""}`}
						onClick={() => {
						  setSelectedCap(cap);
						  setSuggestions([]);
						  setTagSearch("");
						  setTagResults([]);
						  setJustAddedManual(new Set());
						  loadAssigned(cap.id);
						}}

                    >
                      <td>{cap.beer_name}</td>
                      <td>{cap.cap_no}</td>
                      <td>{cap.caps_country?.country_name_full ?? "-"}</td>
                      <td>{cap.sheet ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* RIGHT: selected cap details */}
        <div className="assign-right">
          {!selectedCap ? (
            <div className="admin-card">
              <p className="muted">Select a cap on the left to assign tags.</p>
            </div>
          ) : (
            <div className="admin-card">
              <div className="assign-header">
                <div>
                  <div style={{ fontSize: "1.1rem" }}>
                    <b>{selectedCap.beer_name}</b> <span className="muted">#{selectedCap.cap_no}</span>
                  </div>
                  <div className="muted">
                    {selectedCap.caps_country?.country_name_full ?? "-"} • Sheet: {selectedCap.sheet ?? "-"} • ID: {selectedCap.id}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="button" type="button" onClick={runScan} disabled={scanning || !enableAuto}>
                    {scanning ? "Scanning..." : "Run color scan"}
                  </button>
                  <button className="button" type="button" onClick={save} disabled={loadingAssigned}>
                    Save
                  </button>
                </div>
              </div>

              {/* photo */}
              <div style={{ marginTop: "0.75rem" }}>
                {photoPath ? (
                  <img className="assign-photo" src={supabasePublicUrl(photoPath)} alt="cap" />
                ) : (
                  <div className="thumb-placeholder">No photo</div>
                )}
              </div>

              {/* assigned tags */}
              <div style={{ marginTop: "0.75rem" }}>
                <div className="label">Assigned (manual)</div>
                <div className="pill-wrap">
                  {assignedManual.length ? (
                    assignedManual.map((r) => (
					<button
					  key={r.tag_id}
					  type="button"
					  className={`pill pill-btn ${isManualPendingRemoval(r.tag_id) ? "pill-pending-remove" : ""}`}
					  onClick={() => toggleManual(r.tag_id)}
					  title={isManualPendingRemoval(r.tag_id) ? "Will be removed on Save" : "Click to remove"}
					>
					  {r.tags?.tag}
					</button>

                    ))
                  ) : (
                    <span className="muted">none</span>
                  )}
                </div>

                <div className="label" style={{ marginTop: "0.5rem" }}>
                  Assigned (auto)
                </div>
                <div className="pill-wrap">
                  {assignedAuto.length ? (
                    assignedAuto.map((r) => (
                      <button
                        key={r.tag_id}
                        type="button"
                        className={`pill pill-btn ${isAutoPendingRemoval(r.tag_id) ? "pill-pending-remove" : ""}`}
                        onClick={() => toggleAuto(r.tag_id)}
                        title={isAutoPendingRemoval(r.tag_id) ? "Will be removed on Save" : "Click to uncheck"}
                      >
                        {r.tags?.tag}
                      </button>
                    ))
                  ) : (
                    <span className="muted">none</span>
                  )}
                </div>
              </div>

              {/* suggestions */}
              <div style={{ marginTop: "0.75rem" }}>
                <div className="label">
                  Suggested colors{" "}
                  <span className="muted">
                    (threshold {thresholdPct}% • min sat {minSatPct}% • {enableAuto ? "enabled" : "disabled"})
                  </span>
                </div>

                {enableAuto ? (
                  suggestions.length ? (
                    <div className="suggest-list">
                      {suggestions.map((s) => {
                        const disabled = !s.tag_id;
                        const checked = s.tag_id ? checkedAuto.has(s.tag_id) : false;
                        const pendingRemove = s.tag_id ? isAutoPendingRemoval(s.tag_id) : false;

                        return (
                          <label
                            key={s.bucket}
                            className={`suggest-item ${disabled ? "muted" : ""} ${pendingRemove ? "suggest-pending-remove" : ""}`}
                          >
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={() => s.tag_id && toggleAuto(s.tag_id)}
                            />
                            <span className="suggest-name">{s.bucket}</span>
                            <span className="muted">
                              {s.pct.toFixed(1)}% • conf {(s.confidence * 100).toFixed(0)}%
                              {disabled ? " • missing tag" : ""}
                              {pendingRemove ? " • will remove" : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted">Run scan to generate suggestions.</div>
                  )
                ) : (
                  <div className="muted">Disabled in Settings.</div>
                )}
              </div>

              {/* manual add */}
              <div style={{ marginTop: "0.75rem" }}>
                <div className="label">Add existing tags</div>
                <div className="th-filter" style={{ maxWidth: 420 }}>
                  <input
                    className="th-input"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="search tags (min 2)…"
                  />
                  {tagSearch && (
                    <button className="th-clear" type="button" onClick={() => setTagSearch("")} aria-label="Clear tag search">
                      ✕
                    </button>
                  )}
                </div>

                {tagSearching ? (
                  <div className="muted" style={{ marginTop: "0.5rem" }}>
                    Searching...
                  </div>
                ) : tagResults.length ? (
                  <div className="tag-results">
                    {tagResults.map((t) => {
						const alreadyManual = manualTagIds.has(t.id);
						const alreadyAuto = checkedAuto.has(t.id);
						const disabled = alreadyManual || alreadyAuto;
						const isJustAdded = justAddedManual.has(t.id);

						return (
						  <button
							key={t.id}
							className={`tag-result-item ${isJustAdded ? "tag-result-just-added" : ""}`}
							type="button"
							disabled={disabled}
							onClick={() => {
							  setManualTagIds((prev) => new Set(prev).add(t.id));
							  setJustAddedManual((prev) => new Set(prev).add(t.id));
							}}
							title={disabled ? "Already assigned" : "Add as manual"}
						  >
							<span>{t.tag}</span>
							<span className="muted" style={{ marginLeft: "0.5rem" }}>
							  {t.type}
							</span>
						  </button>
						);

                    })}
                  </div>
                ) : tagSearch.trim().length >= 2 ? (
                  <div className="muted" style={{ marginTop: "0.5rem" }}>
                    No matches.
                  </div>
                ) : null}
              </div>

              <div className="muted" style={{ marginTop: "0.75rem" }}>
                Tip: manual tags are saved with <code>auto_generated=false</code>. Suggested colors save as{" "}
                <code>true</code>.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
