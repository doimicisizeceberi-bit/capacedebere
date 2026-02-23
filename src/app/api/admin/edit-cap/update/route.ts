import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type TradeType =
  | "blind_trade"
  | "exotic_trade"
  | "scan_trade"
  | "blind_ro"
  | "scan_ro";

function isTradeType(x: any): x is TradeType {
  return (
    x === "blind_trade" ||
    x === "exotic_trade" ||
    x === "scan_trade" ||
    x === "blind_ro" ||
    x === "scan_ro"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const barcode = String(body?.barcode ?? "").trim();
    if (!/^[A-Za-z0-9]{3}$/.test(barcode)) {
      return NextResponse.json(
        { error: "barcode is required (3 alphanumeric chars)" },
        { status: 400 }
      );
    }

    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: br, error: brErr } = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, barcode, beer_cap_id, control_bar, sheet")
      .eq("barcode", barcode)
      .maybeSingle();

    if (brErr) return NextResponse.json({ error: brErr.message }, { status: 400 });
    if (!br) return NextResponse.json({ error: "Barcode not found" }, { status: 404 });

    if (!br.beer_cap_id) {
      return NextResponse.json(
        { error: "This barcode is a free token (not assigned to a cap)" },
        { status: 409 }
      );
    }

    if (Number(br.beer_cap_id) !== id) {
      return NextResponse.json(
        { error: "Barcode does not belong to the provided cap id" },
        { status: 409 }
      );
    }

    const beer_name = String(body?.beer_name ?? "").trim();
    if (!beer_name) {
      return NextResponse.json({ error: "beer_name is required" }, { status: 400 });
    }

    const cap_no = Number(body?.cap_no);
    if (!Number.isInteger(cap_no) || cap_no <= 0) {
      return NextResponse.json(
        { error: "cap_no must be a positive integer" },
        { status: 400 }
      );
    }

    const cap_country = Number(body?.cap_country);
    if (!Number.isInteger(cap_country) || cap_country <= 0) {
      return NextResponse.json({ error: "cap_country is required" }, { status: 400 });
    }

    const trade_type_raw = String(body?.trade_type ?? "").trim();
    if (!isTradeType(trade_type_raw)) {
      return NextResponse.json(
        {
          error:
            "trade_type must be one of: blind_trade, exotic_trade, scan_trade, blind_ro, scan_ro",
        },
        { status: 400 }
      );
    }
    const trade_type = trade_type_raw;

    const issuedRaw = body?.issued_year;
    const issued_year =
      issuedRaw === null || issuedRaw === undefined || String(issuedRaw).trim() === ""
        ? null
        : Number(issuedRaw);

    if (issued_year !== null) {
      if (!Number.isInteger(issued_year)) {
        return NextResponse.json({ error: "issued_year must be an integer" }, { status: 400 });
      }
      const currentYear = new Date().getFullYear();
      if (issued_year < 1800 || issued_year > currentYear) {
        return NextResponse.json(
          { error: `issued_year must be between 1800 and ${currentYear}` },
          { status: 400 }
        );
      }
    }

    const sourceRaw = body?.source;
    const source =
      sourceRaw === null || sourceRaw === undefined || String(sourceRaw).trim() === ""
        ? null
        : Number(sourceRaw);

    if (source !== null && (!Number.isInteger(source) || source <= 0)) {
      return NextResponse.json(
        { error: "source must be a positive integer or null" },
        { status: 400 }
      );
    }

    const sheetRaw = body?.sheet;
    const sheet =
      sheetRaw === null || sheetRaw === undefined ? null : String(sheetRaw).trim() || null;

    // lock rules if photo exists
    const { data: photoRow, error: photoErr } = await supabaseAdmin
      .from("photo_caps")
      .select("beer_cap_id")
      .eq("beer_cap_id", id)
      .maybeSingle();

    if (photoErr) return NextResponse.json({ error: photoErr.message }, { status: 400 });

    if (photoRow) {
      const { data: current, error: curErr } = await supabaseAdmin
        .from("beer_caps")
        .select("beer_name, cap_no, cap_country")
        .eq("id", id)
        .maybeSingle();

      if (curErr) return NextResponse.json({ error: curErr.message }, { status: 400 });
      if (!current) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

      if (current.beer_name !== beer_name) {
        return NextResponse.json(
          { error: "Beer name cannot be changed while a photo exists." },
          { status: 403 }
        );
      }
      if (current.cap_no !== cap_no) {
        return NextResponse.json(
          { error: "Cap number cannot be changed while a photo exists." },
          { status: 403 }
        );
      }
      if (current.cap_country !== cap_country) {
        return NextResponse.json(
          { error: "Country cannot be changed while a photo exists." },
          { status: 403 }
        );
      }
    }

    // 1) update token sheet
    const { error: tokenErr } = await supabaseAdmin
      .from("beer_caps_barcodes")
      .update({ sheet })
      .eq("id", br.id);

    if (tokenErr) return NextResponse.json({ error: tokenErr.message }, { status: 400 });

    // 2) update cap fields (+ cap.sheet only if original token)
    const patch: any = {
      beer_name,
      cap_no,
      cap_country,
      trade_type,
      source,
      issued_year,
    };

    if (Number(br.control_bar) === 1) {
      patch.sheet = sheet;
    }

    const { data, error } = await supabaseAdmin
      .from("beer_caps")
      .update(patch)
      .eq("id", id)
      .select(
        `
        id,
        beer_name,
        cap_no,
        cap_country,
        entry_date,
        issued_year,
        sheet,
        trade_type,
        source
      `
      )
      .maybeSingle();

    if (error) {
      const msg = error.message || "Update failed";
      if (
        msg.toLowerCase().includes("beer_caps_unique_capno") ||
        msg.toLowerCase().includes("duplicate key")
      ) {
        return NextResponse.json(
          { error: "Duplicate cap: same Country + Beer name + Cap number already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!data) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    return NextResponse.json({
      data,
      barcode_sheet_updated: true,
      cap_sheet_updated: Number(br.control_bar) === 1,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}