import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function slugBeerNameKeepCase(name: string) {
  // Keep case, make filename-safe: spaces/symbols -> "-"
  return name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const capIdRaw = form.get("capId");
    const file = form.get("file") as File | null;

    if (!capIdRaw || !file) {
      return NextResponse.json({ error: "Missing capId or file" }, { status: 400 });
    }

    const capId = Number(capIdRaw);
    if (!Number.isInteger(capId) || capId < 1) {
      return NextResponse.json({ error: "Invalid capId" }, { status: 400 });
    }

    // Fetch cap info + current photo_path
    const { data: cap, error: capErr } = await supabaseAdmin
      .from("beer_caps")
      .select(`
        id,
        beer_name,
        cap_no,
        caps_country ( country_name_abb ),
        photo_caps ( photo_path )
      `)
      .eq("id", capId)
      .maybeSingle();

    if (capErr) return NextResponse.json({ error: capErr.message }, { status: 400 });
    if (!cap) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    const abb = cap.caps_country?.country_name_abb;
    if (!abb) return NextResponse.json({ error: "Missing country ABB for cap" }, { status: 400 });

    const oldPath: string | null = cap.photo_caps?.photo_path ?? null;

    // New filename rule: beer_name-cap_no-country_abb.ext
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const base = `${slugBeerNameKeepCase(cap.beer_name)}-${cap.cap_no}-${abb}`;
    const filename = `${base}.${ext}`;

    // Upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: upErr } = await supabaseAdmin.storage
      .from("beer-caps")
      .upload(filename, buffer, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    // Update DB
    const { error: dbErr } = await supabaseAdmin
      .from("photo_caps")
      .upsert({ beer_cap_id: capId, photo_path: filename });

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });

    // Delete old file IF it's different (prevents leaving junk behind)
    if (oldPath && oldPath !== filename) {
      const { error: delErr } = await supabaseAdmin.storage
        .from("beer-caps")
        .remove([oldPath]);

      // Not fatal: file may not exist; we still consider operation successful
      if (delErr) {
        console.warn("Could not delete old file:", delErr.message);
      }
    }

    // cache buster token
    return NextResponse.json({ ok: true, filename, bust: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
