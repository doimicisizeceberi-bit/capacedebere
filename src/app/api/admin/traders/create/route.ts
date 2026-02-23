// app/api/admin/traders/create/route.ts
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

    const name = String(body?.name ?? "").trim();
    const country_id = Number(body?.country_id);
    const details = body?.details == null ? null : String(body.details).trim();

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!Number.isInteger(country_id) || country_id < 1) {
      return NextResponse.json({ error: "Invalid country_id" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("traders")
      .insert({ name, country_id, details: details || null })
      .select("id, name, country_id, details, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ trader: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
