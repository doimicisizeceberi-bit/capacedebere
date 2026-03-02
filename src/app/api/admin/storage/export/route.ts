import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import archiver from "archiver";
import { PassThrough } from "stream";

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
    const body = await req.json();

    if (body?.adminSecret !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 🔹 List files (flat bucket assumed)
    const { data: files, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list("", { limit: 10000 });

    if (error) {
      return NextResponse.json(
        { error: `Failed listing bucket: ${error.message}` },
        { status: 500 }
      );
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();

    archive.pipe(stream);

    for (const file of files || []) {
      if (!file.name) continue;

      const { data: fileData, error: downloadError } =
        await supabaseAdmin.storage.from(BUCKET).download(file.name);

      if (downloadError || !fileData) {
        continue; // skip failed file (optional strict mode later)
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      archive.append(buffer, { name: file.name });
    }

    await archive.finalize();

    const now = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const filename = `bucket_photo_caps_${now}.zip`;

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Storage export failed" },
      { status: 500 }
    );
  }
}