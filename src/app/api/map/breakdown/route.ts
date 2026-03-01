import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing Supabase URL/anon key env vars");
}

const supabaseAnon = createClient(supabaseUrl, anonKey);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const iso2Raw = String(searchParams.get("iso2") ?? "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(iso2Raw)) {
    return NextResponse.json(
      { error: "Missing/invalid iso2. Expected ?iso2=RO" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAnon
    .from("v_caps_map_breakdown")
    .select("map_iso2,caps_country_id,display_name,ioc_code,caps_count")
    .eq("map_iso2", iso2Raw)
    .order("caps_count", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const total = (data ?? []).reduce((acc, r: any) => acc + Number(r?.caps_count ?? 0), 0);

  return NextResponse.json({
    iso2: iso2Raw,
    total,
    data: data ?? [],
  });
}