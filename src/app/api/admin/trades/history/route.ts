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

    // group by cap id, count how many duplicates were traded out for each
    const { data, error } = await supabaseAdmin
      .from("trade_caps")
      .select("beer_cap_id, beer_caps:beer_caps(id, beer_name, cap_no), count:beer_cap_id", { count: "exact" });

    // NOTE: Supabase "group by" is limited in query builder.
    // We'll do it via SQL RPC in Step 7B if needed.

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Fallback: do a simple list and aggregate in code (safe for typical trade sizes)
    const listRes = await supabaseAdmin
      .from("trade_caps")
      .select("beer_cap_id")
      .eq("trade_id", trade_id);

    if (listRes.error) return NextResponse.json({ error: listRes.error.message }, { status: 400 });

    const ids = (listRes.data ?? []).map((x: any) => x.beer_cap_id as number);
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

    // Fetch cap details for unique ids
    const uniqueIds = Array.from(counts.keys());
    let caps: any[] = [];
    if (uniqueIds.length) {
      const capsRes = await supabaseAdmin
        .from("beer_caps")
        .select("id, beer_name, cap_no")
        .in("id", uniqueIds);

      if (capsRes.error) return NextResponse.json({ error: capsRes.error.message }, { status: 400 });
      caps = capsRes.data ?? [];
    }

    const byId = new Map<number, { id: number; beer_name: string; cap_no: number }>();
    for (const c of caps) byId.set(c.id, c);

    const rows = uniqueIds
      .map((id) => ({
        beer_cap_id: id,
        qty: counts.get(id) ?? 0,
        cap: byId.get(id) ?? null,
      }))
      .sort((a, b) => b.qty - a.qty || a.beer_cap_id - b.beer_cap_id);

    return NextResponse.json({ trade_id, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
