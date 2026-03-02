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

// Insert order (must respect FK dependencies)
const INSERT_ORDER = [
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

function validateBackupStructure(backup: any) {
  if (!backup?.meta || !backup?.data) {
    return "Invalid backup format.";
  }

  if (backup.meta.app !== "BeerCaps") {
    return "Invalid app identifier.";
  }

  if (backup.meta.version !== 1) {
    return "Unsupported backup version.";
  }

  for (const table of INSERT_ORDER) {
    if (!Array.isArray(backup.data[table])) {
      return `Missing or invalid table: ${table}`;
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body?.adminSecret !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const backup = body?.backup;

    const validationError = validateBackupStructure(backup);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // 🔥 STEP 1: TRUNCATE ALL TABLES
    const { error: truncateError } = await supabaseAdmin.rpc(
      "admin_truncate_all_caps"
    );

    if (truncateError) {
      return NextResponse.json(
        { error: `Truncate failed: ${truncateError.message}` },
        { status: 500 }
      );
    }

    // 🔥 STEP 2: INSERT TABLES IN ORDER
    for (const table of INSERT_ORDER) {
      const rows = backup.data[table];

      if (rows.length === 0) continue;

      const { error } = await supabaseAdmin.from(table).insert(rows);

      if (error) {
        return NextResponse.json(
          { error: `Insert failed for ${table}: ${error.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      restored_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown restore error" },
      { status: 500 }
    );
  }
}