// app/api/admin/trades/remove-barcode/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const trade_id = Number(body?.trade_id);
    const barcode = String(body?.barcode ?? "").trim();

    if (!Number.isInteger(trade_id) || trade_id < 1) {
      return NextResponse.json({ error: "Invalid trade_id" }, { status: 400 });
    }
    if (!/^[A-Za-z0-9]{3}$/.test(barcode)) {
      return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
    }

    // Trade must be pending
    const tradeRes = await supabaseAdmin.from("trades").select("id, status").eq("id", trade_id).maybeSingle();
    if (tradeRes.error) return NextResponse.json({ error: tradeRes.error.message }, { status: 400 });
    if (!tradeRes.data) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (tradeRes.data.status !== "pending") {
      return NextResponse.json({ error: "Only pending trades can remove caps" }, { status: 400 });
    }

    // Locate barcode row
    const instRes = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, control_bar, reserved_trade_id")
      .eq("barcode", barcode)
      .maybeSingle();

    if (instRes.error) return NextResponse.json({ error: instRes.error.message }, { status: 400 });
    if (!instRes.data) return NextResponse.json({ error: "Barcode not found" }, { status: 404 });

    const inst = instRes.data;

    // Reject all wrong states
    if (inst.control_bar !== 3) {
      return NextResponse.json({ error: `Barcode is not reserved (control_bar=${inst.control_bar})` }, { status: 400 });
    }
    if (inst.reserved_trade_id !== trade_id) {
      return NextResponse.json({ error: "Barcode is reserved for a different trade" }, { status: 400 });
    }

    const { data: upd, error: updErr } = await supabaseAdmin
      .from("beer_caps_barcodes")
      .update({ control_bar: 2, reserved_trade_id: null })
      .eq("id", inst.id)
      .eq("control_bar", 3)
      .eq("reserved_trade_id", trade_id)
      .select("id, barcode, beer_cap_id, sheet, control_bar, reserved_trade_id")
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    return NextResponse.json({ removed: upd });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
