import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import unzipper from "unzipper";
import { Readable } from "stream";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSecret = process.env.ADMIN_SECRET!;

if (!supabaseUrl || !serviceKey || !adminSecret) {
  throw new Error("Missing required env vars.");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);
const BUCKET = "photo_caps";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const secret = formData.get("adminSecret");
    const file = formData.get("file");

    if (secret !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing ZIP file." }, { status: 400 });
    }

    // 🔥 STEP 1 — HARD RESET BUCKET
    const { data: existingFiles, error: listError } =
      await supabaseAdmin.storage.from(BUCKET).list("", { limit: 10000 });

    if (listError) {
      return NextResponse.json(
        { error: `Failed listing bucket: ${listError.message}` },
        { status: 500 }
      );
    }

    const namesToDelete =
      existingFiles?.map((f) => f.name).filter(Boolean) ?? [];

    if (namesToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(namesToDelete);

      if (deleteError) {
        return NextResponse.json(
          { error: `Failed clearing bucket: ${deleteError.message}` },
          { status: 500 }
        );
      }
    }

    // 🔥 STEP 2 — EXTRACT ZIP
    const buffer = Buffer.from(await file.arrayBuffer());
    const zipStream = Readable.from(buffer);

    const directory = await unzipper.Open.buffer(buffer);

    let uploadedCount = 0;

    for (const entry of directory.files) {
      if (entry.type !== "File") continue;

      const filename = entry.path;

      const fileBuffer = await entry.buffer();

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(filename, fileBuffer, {
          upsert: false,
          contentType: "image/jpeg", // safe default; can improve later
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Upload failed for ${filename}: ${uploadError.message}` },
          { status: 500 }
        );
      }

      uploadedCount++;
    }

    return NextResponse.json({
      ok: true,
      uploaded_files: uploadedCount,
      restored_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Storage restore failed." },
      { status: 500 }
    );
  }
}