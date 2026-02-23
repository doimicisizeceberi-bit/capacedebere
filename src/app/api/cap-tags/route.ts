import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing Supabase URL/anon key env vars");
}

const supabaseAnon = createClient(supabaseUrl, anonKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const capId = Number(searchParams.get("cap_id"));

  if (!Number.isFinite(capId) || capId <= 0) {
    return NextResponse.json({ error: "cap_id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAnon
    .from("beer_caps_tags")
    .select(
      `
      beer_cap_id,
      tag_id,
      auto_generated,
      tags ( id, tag, type )
    `
    )
    .eq("beer_cap_id", capId)
    .order("auto_generated", { ascending: false })
    .order("tags(type)", { ascending: true })
    .order("tags(tag)", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
