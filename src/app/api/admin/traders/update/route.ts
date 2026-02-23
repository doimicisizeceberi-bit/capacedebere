import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const id = Number(body?.id);
    const name = String(body?.name ?? "").trim();
    const country_id = Number(body?.country_id);
    const detailsRaw = body?.details;
    const details = detailsRaw == null ? null : String(detailsRaw).trim();

    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    if (!Number.isInteger(country_id) || country_id < 1) return NextResponse.json({ error: "Invalid country_id" }, { status: 400 });

    // trader exists?
    const t0 = await supabaseAdmin.from("traders").select("id").eq("id", id).maybeSingle();
    if (t0.error) return NextResponse.json({ error: t0.error.message }, { status: 400 });
    if (!t0.data) return NextResponse.json({ error: "Trader not found" }, { status: 404 });

    // country exists?
    const c0 = await supabaseAdmin.from("caps_country").select("id").eq("id", country_id).maybeSingle();
    if (c0.error) return NextResponse.json({ error: c0.error.message }, { status: 400 });
    if (!c0.data) return NextResponse.json({ error: "Invalid country_id." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("traders")
      .update({
        name,
        country_id,
        details: details && details.length ? details : null,
      })
      .eq("id", id)
      .select("id,name,country_id,details,created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ trader: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
