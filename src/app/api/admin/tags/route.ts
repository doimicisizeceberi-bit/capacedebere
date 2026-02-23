import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function normalizeSlug(input: unknown): string {
  const raw = String(input ?? "").trim().toLowerCase();
  // spaces -> hyphens, remove non [a-z0-9-], collapse hyphens, trim hyphens
  return raw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const tag = normalizeSlug(body?.tag);
  const type = normalizeSlug(body?.type || "custom") || "custom";

  if (!tag) {
    return NextResponse.json({ error: "tag is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tags")
    .insert({ tag, type })
    .select("id, tag, type")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
