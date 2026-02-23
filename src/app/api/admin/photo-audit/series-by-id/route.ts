import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idRaw = url.searchParams.get("id");
    const id = Number(idRaw);

    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // 1) Find the reference cap -> beer_name + cap_country
    const ref = await supabaseAdmin
      .from("beer_caps")
      .select("beer_name, cap_country")
      .eq("id", id)
      .maybeSingle();

    if (ref.error) return NextResponse.json({ error: ref.error.message }, { status: 400 });
    if (!ref.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) Fetch all caps in same series (beer_name + country)
    const { data, error } = await supabaseAdmin
      .from("beer_caps")
      .select(`
        id,
		beer_name,
		cap_no,
		caps_country ( country_name_full ),	
        photo_caps ( photo_path )
      `)
      .eq("beer_name", ref.data.beer_name)
      .eq("cap_country", ref.data.cap_country)
      .order("id", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ caps: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
