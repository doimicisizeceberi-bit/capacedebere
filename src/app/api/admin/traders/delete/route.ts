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
    const id = Number(body?.id);

    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    // trader exists?
    const t0 = await supabaseAdmin.from("traders").select("id").eq("id", id).maybeSingle();
    if (t0.error) return NextResponse.json({ error: t0.error.message }, { status: 400 });
    if (!t0.data) return NextResponse.json({ error: "Trader not found" }, { status: 404 });

    // block if any trades exist
    const check = await supabaseAdmin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("trader_id", id);

    if (check.error) return NextResponse.json({ error: check.error.message }, { status: 400 });

    const tradesCount = check.count ?? 0;
    if (tradesCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete trader: ${tradesCount} trade(s) exist for this trader.` },
        { status: 409 }
      );
    }

    const del = await supabaseAdmin.from("traders").delete().eq("id", id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
