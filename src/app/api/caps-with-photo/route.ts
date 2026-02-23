import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing Supabase URL/anon key env vars");
}

const supabaseAnon = createClient(supabaseUrl, anonKey);

const SORT_KEYS = new Set([
  "id_desc",
  "beer_name_asc",
  "beer_name_desc",
  "country_asc",
  "country_desc",
  "sheet_asc",
  "sheet_desc",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limitRaw = Number(searchParams.get("limit") ?? "10");
  const limit = Math.min(200, Math.max(1, limitRaw));
  const sort = (searchParams.get("sort") ?? "id_desc").trim();
  const safeSort = SORT_KEYS.has(sort) ? sort : "id_desc";

  const beer = (searchParams.get("beer") ?? "").trim();
  const country = (searchParams.get("country") ?? "").trim();
  const sheet = (searchParams.get("sheet") ?? "").trim();

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // IMPORTANT:
  // photo_caps!inner forces only caps that have a related photo_caps row.
  // This matches how your Caps page selects photo_caps.
  let query = supabaseAnon
    .from("beer_caps")
    .select(
      `
        id,
        beer_name,
        cap_no,
        sheet,
        caps_country ( country_name_full ),
        photo_caps!inner ( photo_path )
      `,
      { count: "exact" }
    );

  if (beer) query = query.ilike("beer_name", `%${beer}%`);
  if (sheet) query = query.ilike("sheet", `%${sheet}%`);
  if (country) query = query.ilike("caps_country.country_name_full", `%${country}%`);

  // sorting
  switch (safeSort) {
    case "beer_name_asc":
      query = query.order("beer_name", { ascending: true });
      break;
    case "beer_name_desc":
      query = query.order("beer_name", { ascending: false });
      break;
    case "sheet_asc":
      query = query.order("sheet", { ascending: true, nullsFirst: false }).order("id", { ascending: false });
      break;
    case "sheet_desc":
      query = query.order("sheet", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
      break;
    case "country_asc":
      query = query.order("caps_country(country_name_full)", { ascending: true }).order("beer_name", { ascending: true });
      break;
    case "country_desc":
      query = query.order("caps_country(country_name_full)", { ascending: false }).order("beer_name", { ascending: true });
      break;
    case "id_desc":
    default:
      query = query.order("id", { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    data: data ?? [],
    page,
    limit,
    total: count ?? 0,
    totalPages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
    sort: safeSort,
    beer,
    country,
    sheet,
  });
}
