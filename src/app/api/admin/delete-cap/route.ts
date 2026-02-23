import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBigIntLike(v: any): number | null {
  // Supabase JS sends bigint as number/string depending on context. We keep as number where safe.
  const n = toInt(v);
  return n;
}

type HeaderRow = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;
  entry_date: string;
  issued_year: number | null;
  trade_type: string;

  cap_country: number;
  country_name_full: string;

  source: number | null;
  source_name: string | null;

  has_photo: boolean;
  has_barcode: boolean;
  barcode_rows: number;
  duplicates: number;
};

type BarcodeRow = {
  barcode_row_id: number; // bigint in DB
  beer_cap_id: number;
  barcode: string;
  sheet: string | null;
  control_bar: number;
};

function analyzeIntegrity(rows: BarcodeRow[]) {
  const total = rows.length;
  const originals = rows.filter((r) => r.control_bar === 1).length;
  const zeros = rows.filter((r) => r.control_bar === 0).length;

  const invalid = rows.filter(
    (r) => r.control_bar !== 1 && r.control_bar !== 2 && r.control_bar !== 3
  ).length;

  let ok = true;
  const issues: string[] = [];

  if (total < 1) {
    ok = false;
    issues.push("Expected at least 1 linked barcode row, found 0.");
  }

  if (invalid > 0) {
    ok = false;
    issues.push("Found barcode rows with invalid control_bar (allowed: 1,2,3).");
  }

  // linked rows must not contain control_bar=0
  if (zeros > 0) {
    ok = false;
    issues.push("Found linked barcode rows with control_bar=0 (should not happen).");
  }

  if (total === 1) {
    if (originals !== 1) {
      ok = false;
      issues.push("Exactly 1 barcode row exists, but it is not control_bar=1 (original).");
    }
  } else if (total > 1) {
    if (originals !== 1) {
      ok = false;
      issues.push("Expected exactly 1 original (control_bar=1), but found a different count.");
    }
    // non-original must be 2 or 3
    const badNonOriginal = rows.filter(
      (r) => r.control_bar !== 1 && r.control_bar !== 2 && r.control_bar !== 3
    ).length;
    if (badNonOriginal > 0) {
      ok = false;
      issues.push("Found non-original rows with control_bar not in {2,3}.");
    }
  }

  return { ok, issues };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    /* =========================
       FIND
    ========================= */
    if (action === "find") {
      const id = toInt(body?.id);
      if (!id || id <= 0) {
        return NextResponse.json(
          { error: "Invalid id. Use a positive integer." },
          { status: 400 }
        );
      }

      const { data: header, error: e1 } = await supabaseAdmin
        .from("v_delete_cap_header")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (e1) throw e1;

      if (!header) {
        return NextResponse.json(
          { error: `Cap id ${id} not found.` },
          { status: 404 }
        );
      }

      const h = header as HeaderRow;

      // Case A: no photo, no barcode -> quick-edit
      if (!h.has_photo && !h.has_barcode) {
        return NextResponse.json({
          mode: "no_photo_no_barcode",
          header: h,
        });
      }

      // Case B: has photo -> photo-audit
      if (h.has_photo) {
        return NextResponse.json({
          mode: "has_photo",
          header: h,
        });
      }

      // Case C: no photo but has barcode(s) -> load rows
      // fetch barcode rows for that cap
      const { data: rows, error: e2 } = await supabaseAdmin
        .from("v_delete_cap_barcodes")
        .select("barcode_row_id,beer_cap_id,barcode,sheet,control_bar")
        .eq("beer_cap_id", id);

      if (e2) throw e2;

      const list = (rows ?? []) as BarcodeRow[];

      // order: original first, then by barcode
      list.sort((a, b) => {
        const ao = a.control_bar === 1 ? 0 : 1;
        const bo = b.control_bar === 1 ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return String(a.barcode).localeCompare(String(b.barcode));
      });

      const integrity = analyzeIntegrity(list);

      return NextResponse.json({
        mode: "barcode_path",
        header: h,
        barcodes: list,
        integrity,
      });
    }

    /* =========================
       RELEASE DUPLICATE (control_bar=2)
    ========================= */
    if (action === "release_duplicate") {
      const barcode_row_id = toBigIntLike(body?.barcode_row_id);
      if (!barcode_row_id || barcode_row_id <= 0) {
        return NextResponse.json(
          { error: "Invalid barcode_row_id." },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin.rpc("admin_release_duplicate_barcode", {
        p_barcode_row_id: barcode_row_id,
      });

      if (error) {
        if ((error as any).code === "P0001") {
          return NextResponse.json(
            { error: (error as any).message ?? "Release blocked." },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: (error as any).message ?? "Release failed." },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    /* =========================
       RELEASE ORIGINAL + DELETE CAP (final)
    ========================= */
    if (action === "release_original_delete") {
      const barcode_row_id = toBigIntLike(body?.barcode_row_id);
      if (!barcode_row_id || barcode_row_id <= 0) {
        return NextResponse.json(
          { error: "Invalid barcode_row_id." },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin.rpc("admin_release_original_and_delete_cap", {
        p_barcode_row_id: barcode_row_id,
      });

      if (error) {
        if ((error as any).code === "P0001") {
          return NextResponse.json(
            { error: (error as any).message ?? "Release/deletion blocked." },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: (error as any).message ?? "Release/deletion failed." },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}