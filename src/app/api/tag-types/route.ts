import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

/**
 * GET /api/tag-types?q=ani
 * Returns: { data: [{ id: number, label: string, meta?: string }], total: number }
 *
 * Notes:
 * - We dedupe in JS because Supabase query builder doesn't provide DISTINCT cleanly.
 * - We cap raw rows to a large-ish number; tag types should be small.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();

    // Pull types (with optional filter), then dedupe.
    let query = supabaseAdmin.from("tags").select("type").order("type", { ascending: true });

    if (q.length >= 2) {
      query = query.ilike("type", `%${q}%`);
    }

    // Big cap, but types are typically few.
    const { data, error } = await query.limit(5000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const set = new Set<string>();
    for (const row of data ?? []) {
      const t = (row as any).type;
      if (typeof t === "string" && t.trim()) set.add(t.trim());
    }

    const types = Array.from(set).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      data: types.map((t, i) => ({ id: i + 1, label: t })),
      total: types.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
