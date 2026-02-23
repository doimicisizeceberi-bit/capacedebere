// app/api/admin/traders/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const q = String(url.searchParams.get("q") ?? "").trim();
    const countryIdRaw = url.searchParams.get("country_id");
    const country_id = countryIdRaw ? Number(countryIdRaw) : null;

    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));

    let query = supabaseAdmin
      .from("traders")
      .select("id, name, country_id, details, created_at")
      .order("name", { ascending: true })
      .limit(limit);

    if (q) query = query.ilike("name", `%${q}%`);
    if (country_id && Number.isInteger(country_id) && country_id > 0) query = query.eq("country_id", country_id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ traders: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
