"use client";

import React, { useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import bwipjs from "bwip-js";

export default function Page() {
  const [value, setValue] = useState("A0b");
  const [isBusy, setIsBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // FINAL: 3 chars: A–Z, a–z, 0–9
  const normalized = useMemo(() => value.trim(), [value]);
  const isValid = /^[A-Za-z0-9]{3}$/.test(normalized);

  const generatePDF = async () => {
    if (!isValid || isBusy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsBusy(true);
    try {
      // Label size (mm): 20mm wide x 10mm tall
      const W = 20;
      const H = 10;

      // Split: top 75% barcode, bottom 25% text
      const barcodeAreaH = H * 0.75; // 7.5mm
      const textAreaH = H * 0.25; // 2.5mm

      // Barcode placement inside TOP area (mm)
      const marginTop = 0.2;
      const marginBottomInTopArea = 0.2;

      // Quiet zone / horizontal placement
      const marginLeft = 1.5; // left quiet zone
      const marginRight = 0;  // keep 0 since 3-char scans well for you

      const barcodeWmm = W - marginLeft - marginRight;
      const barcodeHmm = barcodeAreaH - marginTop - marginBottomInTopArea;

      const xMm = marginLeft;
      const yMm = marginTop;

      // High-DPI canvas to reduce blur (best with Acrobat "Print as image")
      const pxPerMm = 40;
      canvas.width = Math.round(barcodeWmm * pxPerMm);
      canvas.height = Math.round(barcodeHmm * pxPerMm);

      await bwipjs.toCanvas(canvas, {
        bcid: "code128",
        text: normalized,
        includetext: false,

        scale: 4,
        height: 18,

        paddingwidth: 0,
        paddingheight: 0,
        backgroundcolor: "FFFFFF",
      });

      // Force landscape (20w x 10h)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [10, 20],
      });

      // Add barcode
      const imgData = canvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", xMm, yMm, barcodeWmm, barcodeHmm, undefined, "FAST");

      // Add bottom text (RIGHT aligned)
      const labelText = "123456789012345";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);

      const textY = barcodeAreaH + textAreaH * 0.72;
      doc.text(labelText, W - 0.5, textY, { align: "right" });

      // Trigger download
      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);

      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${normalized}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 420 }}>
      <h3 style={{ margin: 0, marginBottom: 10 }}>Phomemo M110 – 20×10mm CODE128</h3>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="A0b"
        style={{
          width: "100%",
          padding: 10,
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 8,
          marginBottom: 10,
        }}
      />

      <button
        onClick={generatePDF}
        disabled={!isValid || isBusy}
        style={{
          width: "100%",
          padding: 10,
          fontSize: 16,
          borderRadius: 10,
          border: "none",
          cursor: !isValid || isBusy ? "not-allowed" : "pointer",
          opacity: !isValid || isBusy ? 0.6 : 1,
        }}
      >
        {isBusy ? "Generating..." : "Generate PDF"}
      </button>

      {!isValid && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#b00020" }}>
          Enter exactly 3 characters: A–Z, a–z, 0–9 (example: A0b)
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
