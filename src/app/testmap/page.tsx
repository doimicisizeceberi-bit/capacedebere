"use client";

import React, { useRef, useState } from "react";
import SVGMap from "react-svg-worldmap";

/* =========================
   Helpers
========================= */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/* =========================
   Test Data (static)
========================= */

const testData = [
  { country: "RO", value: 10 },
  { country: "DE", value: 20 },
  { country: "FR", value: 30 },
];

/* =========================
   Component
========================= */

export default function TestMap() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const dragging = useRef(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const mapBoxRef = useRef<HTMLDivElement | null>(null);

  const [tooltip, setTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    text: string;
  } | null>(null);

  /* =========================
     Zoom / Pan
  ========================= */

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!mapBoxRef.current) return;

    const rect = mapBoxRef.current.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update tooltip position (screen space only)
    if (tooltip?.show) {
      setTooltip((t) => (t ? { ...t, x, y } : t));
    }

    // Handle dragging
    if (!dragging.current || !dragStart.current) return;

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    setPan({
      x: dragStart.current.panX + dx,
      y: dragStart.current.panY + dy,
    });
  }

  function onMouseUp() {
    dragging.current = false;
    dragStart.current = null;
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  /* =========================
     Render
  ========================= */

  return (
    <main style={{ padding: 24 }}>
      <h1>Test Map</h1>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setZoom((z) => clamp(z + 0.2, 1, 6))}>+</button>
        <button onClick={() => setZoom((z) => clamp(z - 0.2, 1, 6))}>–</button>
        <button onClick={resetView}>Reset</button>
        <div style={{ marginLeft: "auto" }}>
          Zoom: <b>{Math.round(zoom * 100)}%</b>
        </div>
      </div>

      {/* Map Container */}
      <div
        ref={mapBoxRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          onMouseUp();
          setTooltip(null);
        }}
        style={{
          position: "relative",
          overflow: "hidden",
          border: "1px solid #ccc",
          borderRadius: 12,
          height: 520,
          background: "#f8f8f8",
          cursor: dragging.current ? "grabbing" : "grab",
        }}
      >
        {/* Tooltip (NOT scaled, pure screen space) */}
        {tooltip?.show && mapBoxRef.current && (() => {
          const estW = 200;
          const estH = 36;
          const pad = 12;
          const margin = 6;

          const bw = mapBoxRef.current.clientWidth;
          const bh = mapBoxRef.current.clientHeight;

          let left = tooltip.x + pad;
          let top = tooltip.y + pad;

          if (left + estW > bw - margin) left = tooltip.x - pad - estW;
          if (top + estH > bh - margin) top = tooltip.y - pad - estH;

          left = clamp(left, margin, bw - margin - estW);
          top = clamp(top, margin, bh - margin - estH);

          return (
            <div
              style={{
                position: "absolute",
                left,
                top,
                background: "rgba(0,0,0,0.85)",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 8,
                fontSize: 12,
                pointerEvents: "none",
                zIndex: 50,
                whiteSpace: "nowrap",
              }}
            >
              {tooltip.text}
            </div>
          );
        })()}

        {/* Transformed Map */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            width: "100%",
            height: "100%",
          }}
        >
          <SVGMap
            data={testData}
            size="responsive"
            onMouseOverFunction={(e: any) => {
              const name = e?.countryName ?? e?.countryCode ?? "Unknown";
              setTooltip({
                show: true,
                x: 0,
                y: 0,
                text: name,
              });
            }}
            onMouseOutFunction={() => setTooltip(null)}
          />
        </div>
      </div>
    </main>
  );
}