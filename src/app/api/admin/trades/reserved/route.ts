// app/api/admin/trades/reserved/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const trade_id = Number(url.searchParams.get("trade_id"));

    if (!Number.isInteger(trade_id) || trade_id < 1) {
      return NextResponse.json({ error: "Invalid trade_id" }, { status: 400 });
    }

    // Only show reserved for this trade
    const { data, error } = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, barcode, sheet, beer_cap_id, control_bar, reserved_trade_id")
      .eq("reserved_trade_id", trade_id)
      .eq("control_bar", 3)
      .order("id", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ trade_id, reserved: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
