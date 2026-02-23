// app/api/duplicates/route.ts
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
  "beer_name_asc",
  "beer_name_desc",
  "country_asc",
  "country_desc",
  "sheet_asc",
  "sheet_desc",
  "duplicate_count_asc",
  "duplicate_count_desc",
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const limitRaw = Number(url.searchParams.get("limit") || "10");
    const limit = [10, 50, 100].includes(limitRaw) ? limitRaw : 10;

    const sort = String(url.searchParams.get("sort") || "id_desc");
    const sortKey = SORT_KEYS.has(sort) ? sort : "id_desc";

    const beer = String(url.searchParams.get("beer") || "").trim();
    const sheet = String(url.searchParams.get("sheet") || "").trim();
    const country = String(url.searchParams.get("country") || "").trim();

    // thresholds (same UI rules)
    const beerQ = beer.length >= 3 ? beer : "";
    const sheetQ = sheet.length >= 3 ? sheet : "";
    const countryQ = country.length >= 2 ? country : "";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabaseAdmin
      .from("v_duplicates_page")
      .select(
        `
        id,
        beer_name,
        cap_no,
        sheet,
        entry_date,
        caps_country,
        photo_caps,
        duplicate_count,
        country_name_full_sort
      `,
        { count: "exact" }
      );

    // filters (contains)
    if (beerQ) q = q.ilike("beer_name", `%${beerQ}%`);
    if (sheetQ) q = q.ilike("sheet", `%${sheetQ}%`);
    if (countryQ) q = q.ilike("country_name_full_sort", `%${countryQ}%`);

    // sorting
    if (sortKey === "beer_name_asc") q = q.order("beer_name", { ascending: true });
    else if (sortKey === "beer_name_desc") q = q.order("beer_name", { ascending: false });
    else if (sortKey === "sheet_asc") q = q.order("sheet", { ascending: true, nullsFirst: false });
    else if (sortKey === "sheet_desc") q = q.order("sheet", { ascending: false, nullsFirst: false });
    else if (sortKey === "country_asc") q = q.order("country_name_full_sort", { ascending: true });
    else if (sortKey === "country_desc") q = q.order("country_name_full_sort", { ascending: false });
    else if (sortKey === "duplicate_count_asc") q = q.order("duplicate_count", { ascending: true });
    else if (sortKey === "duplicate_count_desc") q = q.order("duplicate_count", { ascending: false });
    else q = q.order("id", { ascending: false });

    const { data, error, count } = await q.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // remove helper field
    const cleaned = (data ?? []).map((r: any) => {
      const { country_name_full_sort, ...rest } = r;
      return rest;
    });

    return NextResponse.json({
      data: cleaned,
      total: count ?? 0,
      page,
      limit,
      sort: sortKey,
      filters: { beer: beerQ, sheet: sheetQ, country: countryQ },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}