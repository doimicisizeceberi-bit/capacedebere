import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing SUPABASE URL/ANON key env vars");
}

const supabaseAnon = createClient(supabaseUrl, anonKey);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limitRaw = Number(searchParams.get("limit") ?? "200");
  const limit = Math.min(500, Math.max(1, limitRaw));

  // We just select type and dedupe client-side (simple + reliable)
  let query = supabaseAnon.from("tags").select("type").order("type", { ascending: true }).limit(limit);

  if (q) {
    query = query.ilike("type", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const seen = new Set<string>();
  const types: string[] = [];
  for (const row of data ?? []) {
    const t = row.type;
    if (t && !seen.has(t)) {
      seen.add(t);
      types.push(t);
    }
  }

  return NextResponse.json({ data: types });
}
