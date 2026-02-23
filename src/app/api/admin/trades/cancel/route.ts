// app/api/admin/trades/cancel/route.ts
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

    if (!Number.isInteger(trade_id) || trade_id < 1) {
      return NextResponse.json({ error: "Invalid trade_id" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("admin_cancel_trade", { p_trade_id: trade_id });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
