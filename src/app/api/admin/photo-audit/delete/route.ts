// app/api/admin/photo-audit/delete/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const capId = Number(body?.capId);

    if (!Number.isInteger(capId) || capId < 1) {
      return NextResponse.json({ error: "Invalid capId" }, { status: 400 });
    }

    // 1) Fetch current photo_path (and confirm cap exists)
    const { data: cap, error: capErr } = await supabaseAdmin
      .from("beer_caps")
      .select(
        `
        id,
        photo_caps ( photo_path )
      `
      )
      .eq("id", capId)
      .maybeSingle();

    if (capErr) return NextResponse.json({ error: capErr.message }, { status: 400 });
    if (!cap) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    const oldPath: string | null = cap.photo_caps?.photo_path ?? null;

    // If there's no photo row, treat as success (idempotent)
    if (!oldPath) {
      return NextResponse.json({ ok: true, alreadyMissing: true, bust: Date.now() });
    }

    // 2) Delete storage object (non-fatal if it fails / missing)
    const { error: storageErr } = await supabaseAdmin.storage
      .from("beer-caps")
      .remove([oldPath]);

    if (storageErr) {
      console.warn("Could not delete storage object:", storageErr.message);
      // continue anyway (DB delete is more important for "missing photos" logic)
    }

    // 3) Delete DB row from photo_caps
    const { error: dbErr } = await supabaseAdmin
      .from("photo_caps")
      .delete()
      .eq("beer_cap_id", capId);

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      deletedPath: oldPath,
      bust: Date.now(), // cache-buster for UI if needed
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}