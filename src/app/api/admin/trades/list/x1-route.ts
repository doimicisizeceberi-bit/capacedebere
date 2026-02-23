// app/api/admin/trades/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const STATUSES = new Set(["pending", "canceled", "completed"]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const statusRaw = String(url.searchParams.get("status") ?? "pending").trim();
    const status = STATUSES.has(statusRaw) ? statusRaw : "pending";

    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));

    const { data, error } = await supabaseAdmin
      .from("trades")
      .select(
        `
        id,
        status,
        trade_type,
        date_started,
        date_canceled,
        date_completed,
        notes,
        created_at,
        trader:traders (
          id,
          name,
          country_id
        )
      `
      )
      .eq("status", status)
      .order("date_started", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      status,
      limit,
      offset,
      trades: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
