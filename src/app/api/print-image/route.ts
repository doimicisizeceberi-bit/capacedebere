import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Same-origin image proxy for printing.
 * Usage: /api/print-image?path=<photo_path>
 * It will fetch from Supabase public bucket and return the bytes.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const path = String(url.searchParams.get("path") || "").trim();

    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    // Build the public Storage URL (your bucket name is beer-caps)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }

    const remoteUrl = `${base}/storage/v1/object/public/beer-caps/${encodeURIComponent(path)}`;

    const r = await fetch(remoteUrl, { cache: "no-store" });

    if (!r.ok) {
      return NextResponse.json({ error: `Image fetch failed: ${r.status}` }, { status: 404 });
    }

    const contentType = r.headers.get("content-type") || "image/jpeg";
    const bytes = await r.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // caching is ok; printing prefers stability
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
