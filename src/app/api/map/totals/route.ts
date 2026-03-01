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

export async function GET() {
  const { data, error } = await supabaseAnon
    .from("v_caps_map_totals")
    .select("iso2,caps_count");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // handy lookup map for UI
  const map: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!r?.iso2) continue;
    map[String(r.iso2).toUpperCase()] = Number(r.caps_count ?? 0);
  }

  return NextResponse.json({ data: data ?? [], map });
}