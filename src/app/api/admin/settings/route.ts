import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function toStringValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  let entries: Array<{ key: string; value: string }> = [];

  // batch form
  if (body?.updates && typeof body.updates === "object") {
    entries = Object.entries(body.updates).map(([k, v]) => ({
      key: String(k).trim(),
      value: toStringValue(v).trim(),
    }));
  } else if (body?.key) {
    // single form
    entries = [
      {
        key: String(body.key).trim(),
        value: toStringValue(body.value).trim(),
      },
    ];
  } else {
    return NextResponse.json(
      { error: "Provide either {updates:{...}} or {key,value}" },
      { status: 400 }
    );
  }

  entries = entries.filter((e) => e.key.length > 0);

  if (!entries.length) {
    return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
  }

  // Upsert (key is PK)
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .upsert(entries, { onConflict: "key" })
    .select("key, value, description, updated_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
