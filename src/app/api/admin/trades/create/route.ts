// app/api/admin/trades/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const TRADE_TYPES = new Set(["blind", "scan_based"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const trader_id = Number(body?.trader_id);
    const trade_type = String(body?.trade_type ?? "scan_based").trim();
    const notes = body?.notes == null ? null : String(body.notes).trim();

    if (!Number.isInteger(trader_id) || trader_id < 1) {
      return NextResponse.json({ error: "Invalid trader_id" }, { status: 400 });
    }
    if (!TRADE_TYPES.has(trade_type)) {
      return NextResponse.json({ error: "Invalid trade_type" }, { status: 400 });
    }

    // Ensure trader exists (nice error instead of FK error)
    const traderCheck = await supabaseAdmin.from("traders").select("id").eq("id", trader_id).maybeSingle();
    if (traderCheck.error) return NextResponse.json({ error: traderCheck.error.message }, { status: 400 });
    if (!traderCheck.data) return NextResponse.json({ error: "Trader not found" }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("trades")
      .insert({
        trader_id,
        trade_type,
        status: "pending",
        // date_started defaults to now()
        notes: notes || null,
      })
      .select("id, trader_id, status, trade_type, date_started, date_canceled, date_completed, notes, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ trade: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
