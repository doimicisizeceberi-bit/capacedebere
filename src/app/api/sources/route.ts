// app/api/sources/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const SORT_KEYS = new Set([
  "id_desc",

  "name_asc",
  "name_desc",

  "country_asc",
  "country_desc",

  "is_trader_asc",
  "is_trader_desc",

  "caps_count_asc",
  "caps_count_desc",
]);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = clamp(Number(searchParams.get("page") || "1"), 1, 1_000_000);
    const limit = clamp(Number(searchParams.get("limit") || "50"), 1, 100);

    const sortRaw = (searchParams.get("sort") || "id_desc").trim();
    const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "id_desc";

    const name = (searchParams.get("name") || "").trim();
    const countryIdRaw = (searchParams.get("country_id") || "").trim();
    const isTraderRaw = (searchParams.get("is_trader") || "").trim(); // "true" | "false" | ""

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabaseAdmin
      .from("v_sources_page")
      .select(
        "id,source_name,source_country,country_name_full,country_name_abb,details,is_trader,trader_origin_id,has_caps,caps_count",
        { count: "exact" }
      );

    // filters
    if (name.length >= 2) q = q.ilike("source_name", `%${name}%`);

    if (countryIdRaw) {
      const cid = Number(countryIdRaw);
      if (Number.isFinite(cid)) q = q.eq("source_country", cid);
    }

    if (isTraderRaw === "true") q = q.eq("is_trader", true);
    if (isTraderRaw === "false") q = q.eq("is_trader", false);

    // sorting (stable secondary sort by id desc)
    if (sort === "name_asc") q = q.order("source_name", { ascending: true }).order("id", { ascending: false });
    else if (sort === "name_desc") q = q.order("source_name", { ascending: false }).order("id", { ascending: false });
    else if (sort === "country_asc") q = q.order("country_name_full", { ascending: true }).order("id", { ascending: false });
    else if (sort === "country_desc") q = q.order("country_name_full", { ascending: false }).order("id", { ascending: false });
    else if (sort === "is_trader_asc") q = q.order("is_trader", { ascending: true }).order("id", { ascending: false });
    else if (sort === "is_trader_desc") q = q.order("is_trader", { ascending: false }).order("id", { ascending: false });
    else if (sort === "caps_count_asc") q = q.order("caps_count", { ascending: true }).order("id", { ascending: false });
    else if (sort === "caps_count_desc") q = q.order("caps_count", { ascending: false }).order("id", { ascending: false });
    else q = q.order("id", { ascending: false });

    const { data, error, count } = await q.range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const fromTrader = Boolean(body?.from_trader);

    // If importing a trader snapshot
    if (fromTrader) {
      const trader_id = Number(body?.trader_id);
      if (!Number.isInteger(trader_id) || trader_id < 1) {
        return NextResponse.json({ error: "Invalid trader_id" }, { status: 400 });
      }

      const { data: t, error: tErr } = await supabaseAdmin
        .from("traders")
        .select("id,name,country_id,details")
        .eq("id", trader_id)
        .maybeSingle();

      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
      if (!t) return NextResponse.json({ error: "Trader not found" }, { status: 404 });

      // validate country exists (nice message; avoids FK error)
      const { data: c, error: cErr } = await supabaseAdmin
        .from("caps_country")
        .select("id")
        .eq("id", t.country_id)
        .maybeSingle();

      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
      if (!c) return NextResponse.json({ error: "Invalid trader country_id" }, { status: 400 });

      const { data: ins, error: insErr } = await supabaseAdmin
        .from("caps_sources")
        .insert({
          source_name: String(t.name).trim(),
          source_country: Number(t.country_id),
          details: t.details == null ? null : String(t.details).trim(),
          is_trader: true,
          trader_origin_id: Number(t.id),
        })
        .select("id")
        .single();

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

      const { data: created, error: vErr } = await supabaseAdmin
        .from("v_sources_page")
        .select(
          "id,source_name,source_country,country_name_full,country_name_abb,details,is_trader,trader_origin_id,has_caps,caps_count"
        )
        .eq("id", ins.id)
        .maybeSingle();

      if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });

      return NextResponse.json({ source: created }, { status: 201 });
    }

    // Manual create
    const source_name = String(body?.source_name ?? "").trim();
    const source_country = Number(body?.source_country);
    const detailsRaw = body?.details;
    const details = detailsRaw == null ? null : String(detailsRaw).trim();

    if (source_name.length < 2) {
      return NextResponse.json({ error: "source_name must be at least 2 characters." }, { status: 400 });
    }
    if (!Number.isInteger(source_country) || source_country < 1) {
      return NextResponse.json({ error: "Invalid source_country" }, { status: 400 });
    }

    const { data: c, error: cErr } = await supabaseAdmin
      .from("caps_country")
      .select("id")
      .eq("id", source_country)
      .maybeSingle();

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Invalid source_country" }, { status: 400 });

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("caps_sources")
      .insert({
        source_name,
        source_country,
        details: details && details.length ? details : null,
        is_trader: false,
        trader_origin_id: null,
      })
      .select("id")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const { data: created, error: vErr } = await supabaseAdmin
      .from("v_sources_page")
      .select(
        "id,source_name,source_country,country_name_full,country_name_abb,details,is_trader,trader_origin_id,has_caps,caps_count"
      )
      .eq("id", ins.id)
      .maybeSingle();

    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });

    return NextResponse.json({ source: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
