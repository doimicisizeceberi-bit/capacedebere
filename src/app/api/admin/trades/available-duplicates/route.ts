// app/api/admin/trades/available-duplicates/route.ts
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
    const beerCapId = Number(url.searchParams.get("beerCapId"));

    if (!Number.isInteger(beerCapId) || beerCapId < 1) {
      return NextResponse.json({ error: "Invalid beerCapId" }, { status: 400 });
    }

    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));

    // Optional: ensure cap exists (nicer than empty list)
    const capCheck = await supabaseAdmin.from("beer_caps").select("id, beer_name, cap_no").eq("id", beerCapId).maybeSingle();
    if (capCheck.error) return NextResponse.json({ error: capCheck.error.message }, { status: 400 });
    if (!capCheck.data) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, barcode, sheet, control_bar, reserved_trade_id")
      .eq("beer_cap_id", beerCapId)
      .eq("control_bar", 2)
      .is("reserved_trade_id", null)
      .order("id", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      cap: capCheck.data,
      instances: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
