// app/api/admin/sources/update/route.ts
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

    const id = Number(body?.id);
    const source_name = String(body?.source_name ?? "").trim();
    const source_country = Number(body?.source_country);
    const detailsRaw = body?.details;
    const details = detailsRaw == null ? null : String(detailsRaw).trim();

    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (source_name.length < 2) {
      return NextResponse.json(
        { error: "source_name must be at least 2 characters." },
        { status: 400 }
      );
    }
    if (!Number.isInteger(source_country) || source_country < 1) {
      return NextResponse.json({ error: "Invalid source_country" }, { status: 400 });
    }

    // validate country exists
    const { data: c, error: cErr } = await supabaseAdmin
      .from("caps_country")
      .select("id")
      .eq("id", source_country)
      .maybeSingle();

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Invalid source_country" }, { status: 400 });

    // IMPORTANT:
    // Do NOT update is_trader / trader_origin_id here.
    // Those are snapshot/origin fields set at creation time (manual vs imported from traders).
    const { data, error } = await supabaseAdmin
      .from("caps_sources")
      .update({
        source_name,
        source_country,
        details: details && details.length ? details : null,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Source not found" }, { status: 404 });

    // return fresh view row
    const { data: row, error: vErr } = await supabaseAdmin
      .from("v_sources_page")
      .select(
        "id,source_name,source_country,country_name_full,country_name_abb,details,is_trader,trader_origin_id,has_caps,caps_count"
      )
      .eq("id", id)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });

    return NextResponse.json({ source: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
