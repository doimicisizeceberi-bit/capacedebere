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
    // total caps
    const totalRes = await supabaseAdmin
      .from("beer_caps")
      .select("id", { count: "exact", head: true });

    if (totalRes.error) {
      return NextResponse.json({ error: totalRes.error.message }, { status: 400 });
    }

    // missing photos = beer_caps rows where photo_caps join is null
    const missingRes = await supabaseAdmin
      .from("beer_caps")
      .select("id, photo_caps(beer_cap_id)", { count: "exact", head: true })
      .is("photo_caps", null);

    if (missingRes.error) {
      return NextResponse.json({ error: missingRes.error.message }, { status: 400 });
    }

    return NextResponse.json({
      total_caps: totalRes.count ?? 0,
      missing_photos: missingRes.count ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
