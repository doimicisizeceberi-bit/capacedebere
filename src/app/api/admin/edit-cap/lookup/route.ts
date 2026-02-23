import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const barcode = String(url.searchParams.get("barcode") || "").trim();
    const idRaw = String(url.searchParams.get("id") || "").trim();

    // Must provide either barcode or id
    if (!barcode && !idRaw) {
      return NextResponse.json({ error: "Missing barcode or id" }, { status: 400 });
    }

    // If barcode is given, validate format early (matches DB check)
    if (barcode && !/^[A-Za-z0-9]{3}$/.test(barcode)) {
      return NextResponse.json(
        { error: "Invalid barcode format (expected 3 alphanumeric chars)" },
        { status: 400 }
      );
    }

    let resolvedId: number | null = null;
    let barcodeRow: any | null = null;

    if (barcode) {
      // NOTE: v_barcode_lookup should include id + sheet now (token id + token sheet)
      const { data, error } = await supabaseAdmin
        .from("v_barcode_lookup")
        .select("id, barcode, beer_cap_id, control_bar, reserved_trade_id, sheet")
        .eq("barcode", barcode)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      barcodeRow = data ?? null;
      resolvedId = data?.beer_cap_id ?? null;

      if (!barcodeRow) {
        return NextResponse.json(
          { error: "Barcode not found", barcodeRow: null, cap: null },
          { status: 404 }
        );
      }

      // HARD STOP: control_bar=3 => involved in trade, do not load cap details
      if (Number(barcodeRow.control_bar) === 3) {
        return NextResponse.json({
          barcodeRow,
          cap: null,
          blocked: true,
          blocked_reason: "Cap involved in trade (control_bar=3). Not editable in this module.",
        });
      }

      // Barcode exists but is free token (beer_cap_id null)
      if (!resolvedId) {
        return NextResponse.json({
          barcodeRow,
          cap: null,
        });
      }
    } else {
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      resolvedId = id;
    }

    const { data: cap, error: capErr } = await supabaseAdmin
      .from("v_cap_edit_details")
      .select(
        `
        id,
        beer_name,
        cap_no,
        cap_country,
        country_name_full,
        country_name_abb,
        entry_date,
        issued_year,
        sheet,
        trade_type,
        source,
        source_name,
        source_country,
        photo_path
      `
      )
      .eq("id", resolvedId)
      .maybeSingle();

    if (capErr) {
      return NextResponse.json({ error: capErr.message }, { status: 400 });
    }

    if (!cap) {
      return NextResponse.json(
        { error: "Cap not found", barcodeRow, cap: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ barcodeRow, cap });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}