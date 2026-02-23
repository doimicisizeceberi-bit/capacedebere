import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type TradeTypeEnum =
  | "blind_trade"
  | "exotic_trade"
  | "scan_trade"
  | "blind_ro"
  | "scan_ro";

function isTradeTypeEnum(x: any): x is TradeTypeEnum {
  return (
    x === "blind_trade" ||
    x === "exotic_trade" ||
    x === "scan_trade" ||
    x === "blind_ro" ||
    x === "scan_ro"
  );
}

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    /* =========================
       META (countries + sources)
    ========================= */
    if (action === "meta") {
      const { data: countries, error: e1 } = await supabaseAdmin
        .from("caps_country")
        .select("id,country_name_full,country_name_abb")
        .order("country_name_full", { ascending: true });

      if (e1) throw e1;

      const { data: sources, error: e2 } = await supabaseAdmin
        .from("caps_sources")
        .select("id,source_name,source_country,is_trader")
        .order("source_name", { ascending: true });

      if (e2) throw e2;

      return NextResponse.json({
        countries: (countries ?? []).map((c) => ({
          id: c.id,
          label: c.country_name_full,
          meta: c.country_name_abb,
        })),
        sources: (sources ?? []).map((s) => ({
          id: s.id,
          label: s.source_name,
          meta: String(s.source_country ?? ""),
        })),
      });
    }

    /* =========================
       FIND (gate + details + tags)
    ========================= */
    if (action === "find") {
      const id = toInt(body?.id);
      if (!id || id <= 0) {
        return NextResponse.json(
          { error: "Invalid id. Use a positive integer." },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from("v_quick_edit_lookup")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return NextResponse.json(
          { error: `Cap id ${id} not found.` },
          { status: 404 }
        );
      }

      const hasPhoto = !!(data as any).has_photo;
      const hasBarcode = !!(data as any).has_barcode;
      const inTrade = !!(data as any).in_trade;

      const eligible = !hasPhoto && !hasBarcode;

      return NextResponse.json({
        cap: data,
        gate: { eligible, hasPhoto, hasBarcode, inTrade },
      });
    }

    /* =========================
       UPDATE (RPC)
    ========================= */
    if (action === "update") {
      const id = toInt(body?.id);
      if (!id || id <= 0) {
        return NextResponse.json(
          { error: "Invalid id. Use a positive integer." },
          { status: 400 }
        );
      }

      const beer_name = String(body?.beer_name ?? "").trim();
      const cap_no = toInt(body?.cap_no);
      const trade_type = body?.trade_type;
      const cap_country = toInt(body?.cap_country);
      const source = toInt(body?.source); // can be null
      const sheetRaw = body?.sheet;
      const sheet =
        sheetRaw === null || sheetRaw === undefined
          ? null
          : String(sheetRaw).trim() || null;

      const issued_year = toInt(body?.issued_year); // can be null

      if (!beer_name) {
        return NextResponse.json(
          { error: "beer_name is required." },
          { status: 400 }
        );
      }
      if (!cap_no || cap_no <= 0) {
        return NextResponse.json(
          { error: "cap_no must be a positive integer." },
          { status: 400 }
        );
      }
      if (!cap_country || cap_country <= 0) {
        return NextResponse.json(
          { error: "cap_country is required." },
          { status: 400 }
        );
      }
      if (!isTradeTypeEnum(trade_type)) {
        return NextResponse.json(
          { error: "Invalid trade_type." },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin.rpc("admin_quick_update_cap", {
        p_cap_id: id,
        p_beer_name: beer_name,
        p_cap_no: cap_no,
        p_trade_type: trade_type,
        p_cap_country: cap_country,
        p_source: source,
        p_sheet: sheet,
        p_issued_year: issued_year,
      });

      if (error) {
        // Unique index violation -> friendly message
        if ((error as any).code === "23505") {
          return NextResponse.json(
            {
              error:
                "Uniqueness violation: a cap with the same (country + beer name + cap no) already exists.",
            },
            { status: 409 }
          );
        }
        // our PL/pgSQL raises P0001 for gate blocks etc.
        if ((error as any).code === "P0001") {
          return NextResponse.json(
            { error: (error as any).message ?? "Update blocked." },
            { status: 400 }
          );
        }
        throw error;
      }

      return NextResponse.json({ ok: true });
    }

    /* =========================
       DELETE (RPC)
    ========================= */
    if (action === "delete") {
      const id = toInt(body?.id);
      if (!id || id <= 0) {
        return NextResponse.json(
          { error: "Invalid id. Use a positive integer." },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin.rpc("admin_quick_delete_cap", {
        p_cap_id: id,
      });

      if (error) {
        if ((error as any).code === "P0001") {
          return NextResponse.json(
            { error: (error as any).message ?? "Delete blocked." },
            { status: 400 }
          );
        }
        // FK issues etc.
        return NextResponse.json(
          { error: (error as any).message ?? "Delete failed." },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Invalid action." },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}