import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSecret = process.env.ADMIN_SECRET!;

if (!supabaseUrl || !serviceKey || !adminSecret) {
  throw new Error("Missing required env vars.");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const TABLES = [
  "caps_country",
  "tags",
  "ref_iso",
  "app_settings",
  "caps_sources",
  "traders",
  "trades",
  "beer_caps",
  "beer_caps_tags",
  "photo_caps",
  "beer_caps_barcodes",
  "trade_caps",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body?.adminSecret !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const data: Record<string, any[]> = {};
    const summary: Record<string, number> = {};
    let total = 0;

    for (const table of TABLES) {
      const { data: rows, error } = await supabaseAdmin
        .from(table)
        .select("*");

      if (error) {
        return NextResponse.json(
          { error: `Failed exporting ${table}: ${error.message}` },
          { status: 400 }
        );
      }

      data[table] = rows ?? [];
      summary[table] = rows?.length ?? 0;
      total += rows?.length ?? 0;
    }

    const now = new Date();
    const iso = now.toISOString();

    const backup = {
      meta: {
        app: "BeerCaps",
        version: 1,
        created_at: iso,
      },
      summary: {
        ...summary,
        total_records: total,
      },
      data,
    };

    const filename = `db_caps_${iso
      .replace(/:/g, "-")
      .replace(/\..+/, "")}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}