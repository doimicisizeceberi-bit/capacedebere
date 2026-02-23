import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET() {
  try {
    const totalRes = await supabaseAdmin
      .from("beer_caps")
      .select("id", { count: "exact", head: true });

    if (totalRes.error) {
      return NextResponse.json({ error: totalRes.error.message }, { status: 400 });
    }

    const missingRes = await supabaseAdmin
      .from("beer_caps")
      .select("id, beer_caps_barcodes(beer_cap_id)", { count: "exact", head: true })
      .is("beer_caps_barcodes", null);

    if (missingRes.error) {
      return NextResponse.json({ error: missingRes.error.message }, { status: 400 });
    }

    return NextResponse.json({
      total_caps: totalRes.count ?? 0,
      missing_barcodes: missingRes.count ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
