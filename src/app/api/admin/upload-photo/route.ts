import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // important: use Node runtime

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const form = await req.formData();

    const capIdRaw = form.get("capId");
    const filenameRaw = form.get("filename");
    const file = form.get("file") as File | null;

    if (!capIdRaw || !filenameRaw || !file) {
      return NextResponse.json(
        { error: "Missing capId, filename, or file" },
        { status: 400 }
      );
    }

    const capId = Number(capIdRaw);
    const filename = String(filenameRaw);

    if (!Number.isInteger(capId) || capId < 1) {
      return NextResponse.json({ error: "Invalid capId" }, { status: 400 });
    }

    // Convert File -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1) Upload to Storage
    const { error: upErr } = await supabaseAdmin.storage
      .from("beer-caps")
      .upload(filename, buffer, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    // 2) Upsert DB row (store only the filename)
    const { error: dbErr } = await supabaseAdmin
      .from("photo_caps")
      .upsert({ beer_cap_id: capId, photo_path: filename });

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, filename });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
