import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with JSON body: { ids: number[] }" },
    { status: 405 }
  );
}


const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminToken = process.env.ADMIN_EXPORT_TOKEN;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type Row = {
  id: number;
  beer_name: string;
  photo_caps: { photo_path: string } | null;
  avail: number;
};

function truncate(s: string, n: number) {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "…";
}

function ymd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchAsBase64(url: string): Promise<{ b64: string; fmt: "JPEG" | "PNG" } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const lower = url.toLowerCase();

    // crude but effective based on filename extension
    const fmt: "JPEG" | "PNG" =
      lower.endsWith(".png") ? "PNG" : "JPEG";

    return { b64: buf.toString("base64"), fmt };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // Optional protection (recommended)
    if (adminToken) {
      const got = req.headers.get("x-admin-token");
      if (got !== adminToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => null);

    // expected shapes:
    // { ids: number[] }  OR  { items: {id:number}[] }
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids
      : Array.isArray(body?.items)
        ? body.items.map((x: any) => x?.id).filter((x: any) => Number.isFinite(x))
        : [];

    const orderedIds = ids
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (orderedIds.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }
    if (orderedIds.length > 500) {
      return NextResponse.json({ error: "Too many items (max 500)" }, { status: 400 });
    }

    // Fetch rows (unordered)
    const { data, error } = await supabaseAdmin
      .from("v_caps_doubles_page")
      .select("id, beer_name, photo_caps, avail")
      .in("id", orderedIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const byId = new Map<number, Row>();
    (data ?? []).forEach((r: any) => {
      byId.set(Number(r.id), {
        id: Number(r.id),
        beer_name: String(r.beer_name ?? ""),
        photo_caps: r.photo_caps ?? null,
        avail: Number(r.avail ?? 0),
      });
    });

    // Keep requested order; drop missing
		const baseRows: Row[] = orderedIds
		  .map((id) => byId.get(id))
		  .filter(Boolean) as Row[];

		if (baseRows.length === 0) {
		  return NextResponse.json({ error: "No matching rows found" }, { status: 404 });
		}

		// TEST MODE: repeat items to fill multiple pages
		const repeatRaw = Number(body?.repeat ?? 1);
		const repeat = Number.isFinite(repeatRaw) ? Math.max(1, Math.min(20, repeatRaw)) : 1;

		// duplicate in the same order
		const rows: Row[] = Array.from({ length: repeat }, () => baseRows).flat();


    if (rows.length === 0) {
      return NextResponse.json({ error: "No matching rows found" }, { status: 404 });
    }

    // ---------------------------
    // PDF constants (LOCKED)
    // ---------------------------
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PAGE_W = 210;
    const PAGE_H = 297;

    const M_L = 12;
    const M_R = 12;
    const M_T = 12;
    const M_B = 15;

    const GAP_X = 4;
    const GAP_Y = 3;

    const COLS = 5;
    const TILE_W = 34; // ~34mm locked
    const TILE_H = 52; // ~28mm locked

    const HEADER_H = 52; // fixed on page 1
    const FOOTER_H = 6;  // reserved visual space

    const ROWS_P1 = 4;
    const ROWS_PN = 5;

const headerText =
  `Hello, my name is Marius and I am a beer cap collector from Craiova, Romania, collecting since 2017.\n\n` +
  `This document contains my current trade offer.\n\n` +
  `To select a cap, mark the checkbox corresponding to the quantity you would like to receive.` +
  `Please choose only one quantity per cap and send me your completed selection by email. ` +
  `Only one quantity should be selected per cap. \n\n` +
  `Please note that the pictures are for presentation purposes only. ` +
  `The selected caps may vary slightly in condition, but they do not contain serious dents or scratches.\n\n` +
  `After you complete your selection, I will make the physical selection of your caps and send you a photo of the selected items for confirmation.`;



    // helpers
    function drawFooter(pageNum: number, totalPages: number) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      const txt = `Page ${pageNum} of ${totalPages}`;
      const w = doc.getTextWidth(txt);
      doc.text(txt, (PAGE_W - w) / 2, PAGE_H - (M_B - 5));
      doc.setTextColor(0);
    }

			async function drawTile(r: Row, x: number, y: number) {
			  // tile border (thin, light)
			  doc.setDrawColor(200);
			  doc.setLineWidth(0.2);
			  doc.rect(x, y, TILE_W, TILE_H);

			  // layout bands
			  const TOP_H = 9.0;       // two text rows
			  const BOTTOM_H = 10.0;   // two rows (label + checkboxes)
			  const IMG_H = TILE_H - TOP_H - BOTTOM_H;

			  const innerPadX = 1.6;

			  // availability display rule: cap at 5
			  const availShown = r.avail > 5 ? 5 : r.avail;

			  // -------------------------
			  // TOP AREA (2 rows)
			  // -------------------------
			  doc.setTextColor(0);

			  // Row 1: Beer name (20 chars)
			  doc.setFont("helvetica", "bold");
			  doc.setFontSize(8);
			  doc.text(truncate(r.beer_name, 20), x + innerPadX, y + 3.7);

			  // Row 2: left ID, right Available
			  doc.setFont("helvetica", "normal");
			  doc.setFontSize(7.5);

			  const left2 = `ID: ${r.id}`;
			  doc.text(left2, x + innerPadX, y + 7.3);

			  const right2 = `Available: ${availShown}`;
			  const right2w = doc.getTextWidth(right2);
			  doc.text(right2, x + TILE_W - innerPadX - right2w, y + 7.3);

			  // -------------------------
			  // IMAGE AREA
			  // -------------------------
			  const imgX = x + 1.0;
			  const imgY = y + TOP_H + 1.0;
			  const boxW = TILE_W - 2.0;
			  const boxH = IMG_H - 2.0;

			  const photoPath = r.photo_caps?.photo_path ?? null;

			  if (photoPath) {
				const url = `${supabaseUrl}/storage/v1/object/public/beer-caps/${photoPath}`;
				const img = await fetchAsBase64(url);

				if (img) {
				  doc.addImage(img.b64, img.fmt, imgX, imgY, boxW, boxH, undefined, "FAST");
				} else {
				  doc.setDrawColor(220);
				  doc.rect(imgX, imgY, boxW, boxH);
				  doc.setFontSize(7);
				  doc.setTextColor(120);
				  doc.text("No photo", x + 2.0, y + TOP_H + IMG_H / 2);
				  doc.setTextColor(0);
				}
			  } else {
				doc.setDrawColor(220);
				doc.rect(imgX, imgY, boxW, boxH);
				doc.setFontSize(7);
				doc.setTextColor(120);
				doc.text("No photo", x + 2.0, y + TOP_H + IMG_H / 2);
				doc.setTextColor(0);
			  }

			  // -------------------------
			  // BOTTOM AREA (2 rows)
			  // -------------------------
			  const bottomTop = y + TOP_H + IMG_H;

			  // Row 1: instruction
			  doc.setFont("helvetica", "normal");
			  doc.setFontSize(7.5);
			  doc.setTextColor(0);
			  doc.text("Mark the desired quantity:", x + innerPadX, bottomTop + 3.8);

			  // Row 2: 1[ ] 2[ ] 3[ ] 4[ ] 5[ ] (no ":" and no separators)
			  doc.setFontSize(7.2);

			  const row2Y = bottomTop + 7.6;
			  const box = 2.8;        // checkbox size
			  const gap = 0.6;        // gap between number and box
			  const groupGap = 2.0;   // gap between groups

			  let cx = x + innerPadX;

			  const maxBoxes = Math.max(1, Math.min(5, availShown)); // 1..5 safety

				for (let n = 1; n <= maxBoxes; n++) {
				  const label = `${n}`;
				  doc.text(label, cx, row2Y);

				  const lw = doc.getTextWidth(label);
				  const bx = cx + lw + gap;
				  const by = row2Y - box + 0.6;

				  doc.setDrawColor(0);
				  doc.setLineWidth(0.35);
				  doc.rect(bx, by, box, box);

				  cx = bx + box + groupGap;
				}


			  // reset
			  doc.setTextColor(0);
			  doc.setDrawColor(0);
			}



    // ---------------------------
    // Layout + pagination
    // ---------------------------
    const itemsPerPage1 = COLS * ROWS_P1;
    const itemsPerPageN = COLS * ROWS_PN;

    const totalPages =
      rows.length <= itemsPerPage1
        ? 1
        : 1 + Math.ceil((rows.length - itemsPerPage1) / itemsPerPageN);

    // Page 1 header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);

    const headerX = M_L;
    const headerY = M_T;
    const headerW = PAGE_W - M_L - M_R;

    const wrapped = doc.splitTextToSize(headerText, headerW);
    doc.text(wrapped, headerX, headerY + 5);

    // divider line below header
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(M_L, M_T + HEADER_H, PAGE_W - M_R, M_T + HEADER_H);

    // grid start positions
    const gridX = M_L;
    const gridYPage1 = M_T + HEADER_H + 2; // small breathing space after divider
    const gridYNormal = M_T;

    // render rows in order across pages
    let idx = 0;

    // Page 1 tiles
    for (let r = 0; r < ROWS_P1; r++) {
      for (let c = 0; c < COLS; c++) {
        if (idx >= rows.length) break;
        const x = gridX + c * (TILE_W + GAP_X);
        const y = gridYPage1 + r * (TILE_H + GAP_Y);
        await drawTile(rows[idx], x, y);
        idx++;
      }
      if (idx >= rows.length) break;
    }

    // Pages 2+
    for (let p = 2; p <= totalPages; p++) {
      doc.addPage();
      for (let r = 0; r < ROWS_PN; r++) {
        for (let c = 0; c < COLS; c++) {
          if (idx >= rows.length) break;
          const x = gridX + c * (TILE_W + GAP_X);
          const y = gridYNormal + r * (TILE_H + GAP_Y);
          await drawTile(rows[idx], x, y);
          idx++;
        }
        if (idx >= rows.length) break;
      }
    }

    // Footers (after pages exist)
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawFooter(p, totalPages);
    }

    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="trade-offer-${ymd()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
