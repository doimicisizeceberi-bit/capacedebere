// app/api/admin/sources/delete/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);

    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // Guard: cannot delete if referenced by beer_caps.source
    const { data: ref, error: refErr } = await supabaseAdmin
      .from("beer_caps")
      .select("id")
      .eq("source", id)
      .limit(1);

    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 400 });
    if ((ref?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Cannot delete: this source is used by at least one beer cap." }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from("caps_sources").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
