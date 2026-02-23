import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function asIdArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  // dedupe
  return Array.from(new Set(out));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const beer_cap_id = Number(body?.beer_cap_id);
  if (!Number.isFinite(beer_cap_id) || beer_cap_id <= 0) {
    return NextResponse.json({ error: "beer_cap_id is required" }, { status: 400 });
  }

  const tag_ids_auto = asIdArray(body?.tag_ids_auto);
  const tag_ids_manual = asIdArray(body?.tag_ids_manual);

  // prevent overlaps (manual wins: remove from auto)
  const manualSet = new Set(tag_ids_manual);
  const autoFiltered = tag_ids_auto.filter((id) => !manualSet.has(id));

  const rows = [
    ...autoFiltered.map((tag_id) => ({ beer_cap_id, tag_id, auto_generated: true })),
    ...tag_ids_manual.map((tag_id) => ({ beer_cap_id, tag_id, auto_generated: false })),
  ];

  // Replace-all strategy (simple + safe)
  const { error: delErr } = await supabaseAdmin
    .from("beer_caps_tags")
    .delete()
    .eq("beer_cap_id", beer_cap_id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const { error: insErr } = await supabaseAdmin.from("beer_caps_tags").insert(rows);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
