"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";


function project([lon, lat]: [number, number]) {
  // simple equirectangular projection
  const x = (lon + 180) * (1000 / 360);
  const y = (90 - lat) * (500 / 180);
  return [x, y];
}

function geoToPath(coords: any): string {
  return coords
    .map((ring: any) =>
      ring
        .map(([lon, lat]: [number, number], i: number) => {
          const [x, y] = project([lon, lat]);
          return `${i === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ") + " Z"
    )
    .join(" ");
}
/* =========================
   Utils / helpers
========================= */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// More aggressive shrink at high zoom
function getTooltipScale(zoom: number) {
  // 1 => 1.00
  // 3 => ~0.46..0.55
  // 6 => ~0.35..0.45 (clamped)
  return clamp(1 / Math.pow(Math.max(1, zoom), 0.75), 0.35, 1);
}

function FlagImg({ iso2, size = 18 }: { iso2: string; size?: number }) {
  const cc = String(iso2 || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return <span className="muted">—</span>;

  const h = size;
  const w = Math.round((size * 4) / 3); // 4:3

  const src = `https://flagcdn.com/${w}x${h}/${cc}.png`;

  return (
    <img
      src={src}
      width={w}
      height={h}
      alt={cc.toUpperCase()}
      loading="lazy"
      style={{
        display: "inline-block",
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.12)",
        verticalAlign: "middle",
      }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function iso2ToCountryName(iso2: string) {
  try {
    const dn = new Intl.DisplayNames([navigator.language || "en"], { type: "region" });
    return dn.of(iso2.toUpperCase()) || iso2.toUpperCase();
  } catch {
    return iso2.toUpperCase();
  }
}

type ColorMode = "buckets" | "quantiles" | "log";

function bucketsLevel(count: number) {
  if (!count) return 0;
  if (count <= 4) return 1;
  if (count <= 19) return 2;
  if (count <= 74) return 3;
  if (count <= 199) return 4;
  return 5;
}

function logLevel(count: number) {
  if (!count) return 0;
  const v = Math.log10(count);
  const lvl = Math.floor(v * 1.6) + 1;
  return clamp(lvl, 1, 5);
}

function computeQuantileThresholds(values: number[], k: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((i * sorted.length) / k);
    thresholds.push(sorted[clamp(idx, 0, sorted.length - 1)]);
  }
  return thresholds;
}

function quantileLevel(count: number, thresholds: number[]) {
  if (!count) return 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]) return i + 1;
  }
  return thresholds.length + 1;
}

function levelToColor(level: number) {
const palette = [
  "#ffffff", // 0 - no caps (pure white)
  "#fef3c7", // 1 - very light amber
  "#fcd34d", // 2
  "#f59e0b", // 3
  "#b45309", // 4
  "#78350f", // 5 - deep brown/amber
];
  return palette[clamp(level, 0, palette.length - 1)];
}

/* =========================
   API shapes
========================= */

type TotalsResp = {
  data: Array<{ iso2: string; caps_count: number }>;
  map: Record<string, number>;
};

type BreakdownRow = {
  map_iso2: string;
  caps_country_id: number;
  display_name: string;
  ioc_code: string;
  caps_count: number;
};

type BreakdownResp = {
  iso2: string;
  total: number;
  data: BreakdownRow[];
};

/* =========================
   Page
========================= */

export default function CapMapPage() {
  const [loading, setLoading] = useState(true);

  const [totalsMap, setTotalsMap] = useState<Record<string, number>>({});
  const [totalsData, setTotalsData] = useState<Array<{ iso2: string; value: number }>>([]);

	const [worldGeo, setWorldGeo] = useState<any>(null);
	
	const [viewBox, setViewBox] = useState({
			  x: 0,
			  y: 0,
			  w: 1000,
			  h: 500,
			});
	

  const [mode, setMode] = useState<ColorMode>("buckets");

  const [selectedIso2, setSelectedIso2] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResp | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // Zoom/pan

  const dragging = useRef(false);
const dragStart = useRef<{
  x: number;
  y: number;
  viewX: number;
  viewY: number;
} | null>(null);

  // Map box ref (for tooltip positioning)
  const mapBoxRef = useRef<HTMLDivElement | null>(null);

  // Track last mouse position INSIDE map box (so tooltip can appear exactly at cursor)
  const lastMouseInBox = useRef<{ x: number; y: number }>({ x: 0, y: 0 });


			const [hovered, setHovered] = useState<{
			  iso2: string;
			  value: number;
			  x: number;
			  y: number;
			} | null>(null);

  async function loadTotals() {
    setLoading(true);
    try {
      const res = await fetch("/api/map/totals", { cache: "no-store" });
      const json: TotalsResp = await res.json();
      if (!res.ok) throw new Error((json as any)?.error || "Failed to load map totals");

      const map = json.map || {};
      setTotalsMap(map);

      const arr = Object.entries(map).map(([iso2, cnt]) => ({
        iso2: iso2.toUpperCase(),
        value: Number(cnt ?? 0),
      }));
      setTotalsData(arr);
    } catch (e: any) {
      alert(e?.message ?? "Failed to load map totals");
      setTotalsMap({});
      setTotalsData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTotals();
  }, []);

		useEffect(() => {
		  fetch("/maps/world.geojson")
			.then((res) => res.json())
			.then((data) => setWorldGeo(data))
			.catch(() => {
			  alert("Failed to load world map");
			});
		}, []);


  async function loadBreakdown(iso2: string) {
    setPanelLoading(true);
    setBreakdown(null);
    try {
      const res = await fetch(`/api/map/breakdown?iso2=${encodeURIComponent(iso2)}`, { cache: "no-store" });
      const json: BreakdownResp = await res.json();
      if (!res.ok) throw new Error((json as any)?.error || "Failed to load breakdown");
      setBreakdown(json);
    } catch (e: any) {
      alert(e?.message ?? "Failed to load breakdown");
      setBreakdown({ iso2, total: 0, data: [] });
    } finally {
      setPanelLoading(false);
    }
  }

  const quantileThresholds = useMemo(() => {
    if (mode !== "quantiles") return [];
    const vals = Object.values(totalsMap).filter((n) => Number(n) > 0) as number[];
    if (vals.length < 5) return [];
    return computeQuantileThresholds(vals, 5);
  }, [mode, totalsMap]);

				const styleFunction = useMemo(() => {
				  return ({ countryCode, countryValue }: { countryCode: string; countryValue: number }) => {
					const count = Number(countryValue ?? 0);

					let level = 0;
					if (mode === "buckets") level = bucketsLevel(count);
					else if (mode === "log") level = logLevel(count);
					else level = quantileLevel(count, quantileThresholds);

					const baseFill = levelToColor(level);
					const fill = level === 0 ? "url(#zeroPattern)" : baseFill;

					const code = countryCode.toUpperCase();
					const isSelected = code === selectedIso2;

					return {
					  fill,
					  cursor: "pointer",
					  outline: "none",
					  transition: "fill 0.25s ease",
					} as React.CSSProperties;
				  };
				}, [mode, quantileThresholds, selectedIso2]);

  const legend = useMemo(() => {
    if (mode === "buckets") {
      return [
        { label: "0", level: 0 },
        { label: "1–4", level: 1 },
        { label: "5–19", level: 2 },
        { label: "20–74", level: 3 },
        { label: "75–199", level: 4 },
        { label: "200+", level: 5 },
      ];
    }
    if (mode === "log") {
      return [
        { label: "0", level: 0 },
        { label: "low", level: 1 },
        { label: "…", level: 2 },
        { label: "…", level: 3 },
        { label: "…", level: 4 },
        { label: "high", level: 5 },
      ];
    }
    const t = quantileThresholds;
    return [
      { label: "0", level: 0 },
      { label: t[0] ? `≤${t[0]}` : "Q1", level: 1 },
      { label: t[1] ? `≤${t[1]}` : "Q2", level: 2 },
      { label: t[2] ? `≤${t[2]}` : "Q3", level: 3 },
      { label: t[3] ? `≤${t[3]}` : "Q4", level: 4 },
      { label: t[3] ? `>${t[3]}` : "Q5", level: 5 },
    ];
  }, [mode, quantileThresholds]);

  const top10 = useMemo(() => {
    return Object.entries(totalsMap)
      .map(([iso2, count]) => ({ iso2: iso2.toUpperCase(), count: Number(count || 0) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [totalsMap]);

function resetView() {
  setViewBox({ x: 0, y: 0, w: 1000, h: 500 });
}

function onMouseDown(e: React.MouseEvent) {
  dragging.current = true;

  dragStart.current = {
    x: e.clientX,
    y: e.clientY,
    viewX: viewBox.x,
    viewY: viewBox.y,
  };
}

function onMouseMove(e: React.MouseEvent) {
  const box = mapBoxRef.current;
  if (!box) return;

  const rect = box.getBoundingClientRect();

  // ✅ ALWAYS track mouse (for tooltip)
  lastMouseInBox.current = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  // ✅ Only pan if dragging
  if (!dragging.current) return;

  const start = dragStart.current;
  if (!start) return;

  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;

  const scaleX = viewBox.w / box.clientWidth;
  const scaleY = viewBox.h / box.clientHeight;

  setViewBox((prev) => ({
    ...prev,
    x: start.viewX - dx * scaleX,
    y: start.viewY - dy * scaleY,
  }));
}

function zoomView(factor: number) {
  setViewBox((prev) => {
    const cx = prev.x + prev.w / 2;
    const cy = prev.y + prev.h / 2;

    const newW = prev.w / factor;
    const newH = prev.h / factor;

    return {
      x: cx - newW / 2,
      y: cy - newH / 2,
      w: newW,
      h: newH,
    };
  });
}

function onMouseUp() {
  dragging.current = false;
  dragStart.current = null;
}

  function closePanel() {
    setSelectedIso2(null);
    setBreakdown(null);
  }

if (loading || !worldGeo)
  return <p style={{ padding: "2rem" }}>Loading map...</p>;

  return (
    <main className="page">
            <h1 className="h1-display">🌍 CapMap</h1>

      {/* Header bar */}
      <div className="pager" style={{ marginBottom: "1rem" }}>
        <div className="filters-bar">
          <div className="filters-active">
            <span className="muted">Interactive world map • click a country for details</span>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span className="muted">Color mode:</span>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="color-mode"
                value="buckets"
                checked={mode === "buckets"}
                onChange={() => setMode("buckets")}
              />
              <span className="muted">Buckets</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="color-mode"
                value="quantiles"
                checked={mode === "quantiles"}
                onChange={() => setMode("quantiles")}
              />
              <span className="muted">Quantiles</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="color-mode" value="log" checked={mode === "log"} onChange={() => setMode("log")} />
              <span className="muted">Log</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
        {/* MAP */}
        <div className="card" style={{ padding: 12, position: "relative" }}>
		
								<div
								  style={{
									position: "absolute",
									left: 8,
									top: "50%",
									transform: "translateY(-50%)",
									zIndex: 40,
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 8,
									padding: "8px 4px",
									borderRadius: 12,
									background: "rgba(255,255,255,0.45)",
									backdropFilter: "blur(3px)",
								  }}
								>
								  {/* Plus */}
								  <button
									type="button"
										onClick={() => zoomView(1.5)}
									style={{
									  border: "none",
									  background: "transparent",
									  cursor: "pointer",
									  fontSize: 18,
									  lineHeight: 1,
									  padding: 2,
									  opacity: 0.8,
									}}
								  >
									+
								  </button>

										{/* Taller vertical slider */}
<input
  type="range"
  min={1}
  max={16}
  step={0.1}
  value={1000 / viewBox.w}
  onChange={(e) => {
    const z = Number(e.target.value);

    setViewBox((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;

      const newW = 1000 / z;
      const newH = 500 / z;

      return {
        x: cx - newW / 2,
        y: cy - newH / 2,
        w: newW,
        h: newH,
      };
    });
  }}
  style={{
    writingMode: "vertical-lr",
    direction: "rtl",        // 👈 makes it go bottom → top
    height: 280,
    width: 20,
    cursor: "pointer",
  }}
/>
								  {/* Minus */}
								  <button
									type="button"
										onClick={() => zoomView(1 / 1.5)}
									style={{
									  border: "none",
									  background: "transparent",
									  cursor: "pointer",
									  fontSize: 18,
									  lineHeight: 1,
									  padding: 2,
									  opacity: 0.8,
									}}
								  >
									–
								  </button>
								</div>
		
		
          {/* Controls */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <button className="button" type="button" onClick={() => zoomView(1.2)}>
              +
            </button>
            <button className="button" type="button" onClick={() => zoomView(1 / 1.2)}>
              –
            </button>
            <button className="button" type="button" onClick={resetView}>
              Reset
            </button>

            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <span className="muted">Zoom:</span>
              <b>{Math.round((1000 / viewBox.w) * 100)}%</b>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {legend.map((x) => (
              <div key={x.level} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: levelToColor(x.level),
                    border: "1px solid #bbb",
                    display: "inline-block",
                  }}
                />
                <span className="muted">{x.label}</span>
              </div>
            ))}
          </div>

          {/* Map container (tooltip lives INSIDE this box) */}
<div
  ref={mapBoxRef}
  className="capmap-box"
  onMouseDown={onMouseDown}
  onMouseMove={onMouseMove}
  onMouseUp={onMouseUp}
  onMouseLeave={() => {
    onMouseUp();
    setHovered(null); // 👈 important: hide tooltip when leaving map
  }}
  style={{
    overflow: "hidden",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    aspectRatio: "2 / 1",
    userSelect: "none",
    background: "linear-gradient(to bottom, #eaf4ff 0%, #dbeafe 100%)",
    position: "relative",
    cursor: dragging.current ? "grabbing" : "grab",
  }}
>
  {/* ✅ HOVER TOOLTIP */}
  {hovered && (
    <div
      style={{
        position: "absolute",

        // 👇 smart positioning (prevents overflow)
        left: Math.min(
          hovered.x + 12,
          (mapBoxRef.current?.clientWidth || 0) - 140
        ),
        top: Math.max(hovered.y - 12, 10),

        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.2,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 50,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {iso2ToCountryName(hovered.iso2)}
      </div>
      <div style={{ opacity: 0.8 }}>
        {hovered.value} caps
      </div>
    </div>
  )}


            {/* Tooltip (absolute, clamped within map box, follows pointer exactly) */}
           

				<div
				  style={{
					position: "relative",
					width: "100%",
					height: "100%",
				  }}
				>
				  

				  {/* SVG Map */}
				  <div style={{ position: "relative", zIndex: 1 }}>
					
					<svg width="0" height="0" style={{ position: "absolute" }}>
					  <defs>
						<pattern
						  id="zeroPattern"
						  patternUnits="userSpaceOnUse"
						  width="2"
						  height="2"
						  patternTransform="rotate(45)"
						>
						  {/* White base */}
						  <rect width="6" height="6" fill="#ffffff" />

						  {/* Diagonal line */}
						  <line
							x1="0"
							y1="0"
							x2="0"
							y2="6"
							stroke="rgba(220,38,38,0.15)"   /* light red */
							strokeWidth="1"
						  />
						</pattern>
					  </defs>
					</svg>
					
							<svg
							  viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
								  preserveAspectRatio="xMidYMid meet"
								  style={{ width: "100%", height: "100%" }}
								>
							  <defs>
								<pattern
								  id="zeroPattern"
								  patternUnits="userSpaceOnUse"
								  width="6"
								  height="6"
								  patternTransform="rotate(45)"
								>
								  <rect width="6" height="6" fill="#ffffff" />
								  <line
									x1="0"
									y1="0"
									x2="0"
									y2="6"
									stroke="rgba(220,38,38,0.15)"
									strokeWidth="1"
								  />
								</pattern>
							  </defs>

							  {worldGeo.features.map((f: any, i: number) => {
								
								let iso2 =
								  f.properties?.["ISO3166-1-Alpha-2"] ||
								  f.properties?.ISO_A2 ||
								  "";

								iso2 = String(iso2).toUpperCase();

								// ignore invalid codes
								if (iso2 === "-99") iso2 = "";
								
								const value = totalsMap[iso2] || 0;

								let level = 0;
								if (mode === "buckets") level = bucketsLevel(value);
								else if (mode === "log") level = logLevel(value);
								else level = quantileLevel(value, quantileThresholds);

								const fill =
								  level === 0 ? "url(#zeroPattern)" : levelToColor(level);

								const geometry = f.geometry;
								let d = "";

								if (geometry.type === "Polygon") {
								  d = geoToPath(geometry.coordinates);
								} else if (geometry.type === "MultiPolygon") {
								  d = geometry.coordinates.map(geoToPath).join(" ");
								}

								return (
									<path
									  key={i}
									  d={d}
									  fill={fill}
									  stroke="rgba(0,0,0,0.2)"
									  strokeWidth={0.3}
									  style={{ cursor: "pointer" }}

									  onMouseEnter={(e) => {
										if (!iso2 || iso2.length !== 2) return;

										// highlight border
										e.currentTarget.style.stroke = "#2563eb";
										e.currentTarget.style.strokeWidth = "0.8";

										setHovered({
										  iso2,
										  value,
										  x: lastMouseInBox.current.x,
										  y: lastMouseInBox.current.y,
										});
									  }}

									  onMouseMove={() => {
										if (!iso2 || iso2.length !== 2) return;

										// always update (no dependency on prev → no flicker)
										setHovered({
										  iso2,
										  value,
										  x: lastMouseInBox.current.x,
										  y: lastMouseInBox.current.y,
										});
									  }}

									  onMouseLeave={(e) => {
										// restore border
										e.currentTarget.style.stroke = "rgba(0,0,0,0.2)";
										e.currentTarget.style.strokeWidth = "0.3";

										setHovered(null);
									  }}

									  onClick={(e) => {
										if (!iso2 || iso2.length !== 2) return;

										setSelectedIso2(iso2);
										loadBreakdown(iso2);

										const path = e.currentTarget as SVGGraphicsElement;
										if (!path?.getBBox) return;

										const bbox = path.getBBox();

										const cx = bbox.x + bbox.width / 2;
										const cy = bbox.y + bbox.height / 2;

										const zoomFactor = 4;

										const newW = 1000 / zoomFactor;
										const newH = 500 / zoomFactor;

										const newX = cx - newW / 2;
										const newY = cy - newH / 2;

										setViewBox({
										  x: newX,
										  y: newY,
										  w: newW,
										  h: newH,
										});
									  }}
									/>
								);
							  })}
							</svg>
				  </div>
				</div>
				</div>
				</div>

        {/* PANEL */}
				<div className="card" style={{ padding: 12 }}>

				  {/* Always visible intro */}
				  <div className="muted" style={{ lineHeight: 1.5 }}>
					Click a country to see details.
					<div style={{ marginTop: 8 }}>
					  Tip: use <b>+ / –</b> to zoom and drag to pan.
					</div>
				  </div>

				  {/* Always visible Top 10 */}
				  {top10.length > 0 && (
					<div style={{ marginTop: 14 }}>
					  <div className="muted" style={{ fontSize: 12 }}>
						<b>Top 10 countries</b>
					  </div>

					  <table className="table" style={{ marginTop: 6, fontSize: 12 }}>
						<tbody>
						  {top10.map((x, i) => (
							<tr key={x.iso2}>
							  <td style={{ padding: "4px 6px", lineHeight: "16px" }}>
								<span className="muted" style={{ marginRight: 6 }}>
								  {i + 1}.
								</span>
								<FlagImg iso2={x.iso2} size={14} />
								<span style={{ marginLeft: 8 }}>
								  <a
									className="linklike"
									href={`/caps?map_iso2=${encodeURIComponent(x.iso2)}`}
									style={{ fontSize: 12 }}
								  >
									{iso2ToCountryName(x.iso2)}
								  </a>{" "}
								  <span className="muted">({x.iso2})</span>
								</span>
							  </td>
							  <td
								style={{
								  textAlign: "right",
								  width: 55,
								  padding: "4px 6px",
								  fontWeight: 600,
								}}
							  >
								{x.count}
							  </td>
							</tr>
						  ))}
						</tbody>
					  </table>
					</div>
				  )}

				  {/* Divider only when a country is selected */}
				  {selectedIso2 && (
					<>
					  <hr style={{ margin: "12px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

					  {/* Country Breakdown Panel */}
					  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<div>
							<h2 style={{ margin: 0 }}>
							  Country: <b>{iso2ToCountryName(selectedIso2)}</b>
							</h2>
						  <div className="muted" style={{ marginTop: 4 }}>
							Collection code: <b>{breakdown?.data?.[0]?.ioc_code ?? "—"}</b> • ISO2 code:{" "}
							<b>{selectedIso2}</b>
						  </div>
						</div>

						<div style={{ marginLeft: "auto" }}>
						  <button className="button" type="button" onClick={closePanel}>
							Close
						  </button>
						</div>
					  </div>

					  <div className="muted" style={{ marginTop: 6 }}>
						Total caps: <b>{panelLoading ? "…" : breakdown?.total ?? 0}</b>
					  </div>

					  <div style={{ marginTop: 10 }}>
						<button
						  className="button"
						  type="button"
						  onClick={() => {
							window.location.href = `/caps?map_iso2=${encodeURIComponent(selectedIso2)}`;
						  }}
						>
						  Open caps list for this country
						</button>
					  </div>

					  <hr style={{ margin: "12px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

					  {panelLoading ? (
						<div className="muted">Loading breakdown...</div>
					  ) : !breakdown?.data?.length ? (
						<div className="muted">No breakdown available.</div>
					  ) : (
						<table className="table">
						  <thead>
							<tr>
							  <th>Entity</th>
							  <th style={{ width: 44, textAlign: "center" }}>Flag</th>
							  <th style={{ width: 80 }}>IOC</th>
							  <th style={{ width: 70, textAlign: "right" }}>Caps</th>
							</tr>
						  </thead>
						  <tbody>
							{breakdown.data.map((r) => (
							  <tr key={r.caps_country_id}>
								<td>{r.display_name}</td>
								<td style={{ textAlign: "center" }}>
								  <FlagImg iso2={selectedIso2} />
								</td>
								<td className="muted">{r.ioc_code}</td>
								<td style={{ textAlign: "right" }}>
								  <b>{r.caps_count}</b>
								</td>
							  </tr>
							))}
						  </tbody>
						</table>
					  )}
					</>
				  )}
				</div>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        Note: non-ISO entities are rolled up to parent ISO2 for totals.
      </div>
    </main>
  );
}