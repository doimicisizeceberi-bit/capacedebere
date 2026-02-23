import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const SORT_KEYS = new Set([
  "id_desc",

  "name_asc",
  "name_desc",

  "country_asc",
  "country_desc",

  "completed_asc",
  "completed_desc",
]);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = clamp(Number(searchParams.get("page") || "1"), 1, 1_000_000);
    const limit = clamp(Number(searchParams.get("limit") || "10"), 1, 100);

    const sortRaw = (searchParams.get("sort") || "id_desc").trim();
    const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "id_desc";

    const name = (searchParams.get("name") || "").trim();
    const countryIdRaw = (searchParams.get("country_id") || "").trim();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // base query from view
    let q = supabaseAdmin
      .from("v_traders_page")
		.select(
		  "id,name,country_id,country_name_full,country_name_abb,details,created_at,completed_trades,has_trades",
		  { count: "exact" }
		);


    // filters
    if (name.length >= 2) {
      q = q.ilike("name", `%${name}%`);
    }

    if (countryIdRaw) {
      const country_id = Number(countryIdRaw);
      if (Number.isFinite(country_id)) {
        q = q.eq("country_id", country_id);
      }
    }

    // sorting (always add stable secondary sort by id desc)
    if (sort === "name_asc") q = q.order("name", { ascending: true }).order("id", { ascending: false });
    else if (sort === "name_desc") q = q.order("name", { ascending: false }).order("id", { ascending: false });
    else if (sort === "country_asc") q = q.order("country_name_full", { ascending: true }).order("id", { ascending: false });
    else if (sort === "country_desc") q = q.order("country_name_full", { ascending: false }).order("id", { ascending: false });
    else if (sort === "completed_asc") q = q.order("completed_trades", { ascending: true }).order("id", { ascending: false });
    else if (sort === "completed_desc") q = q.order("completed_trades", { ascending: false }).order("id", { ascending: false });
    else q = q.order("id", { ascending: false });

    const { data, error, count } = await q.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const country_id = Number(body?.country_id);
    const detailsRaw = body?.details;
    const details = detailsRaw == null ? null : String(detailsRaw).trim();

    if (name.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    }
    if (!Number.isFinite(country_id)) {
      return NextResponse.json({ error: "country_id is required." }, { status: 400 });
    }

    // Ensure country exists (nice validation; avoids FK error message)
    const { data: c, error: cErr } = await supabaseAdmin
      .from("caps_country")
      .select("id")
      .eq("id", country_id)
      .maybeSingle();

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Invalid country_id." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("traders")
      .insert({
        name,
        country_id,
        details: details && details.length ? details : null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
