import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

const supabaseAnon = createClient(supabaseUrl, anonKey);

const SORT_KEYS = new Set(["tag_asc", "tag_desc", "type_asc", "type_desc"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const type = (searchParams.get("type") ?? "").trim();

  const sort = (searchParams.get("sort") ?? "tag_asc").trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");
  const pageSize = Math.min(200, Math.max(1, pageSizeRaw));

  const safeSort = SORT_KEYS.has(sort) ? sort : "tag_asc";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAnon
    .from("tags")
    .select("id, tag, type", { count: "exact" });

  if (q) {
    // matches tag or type
    query = query.or(`tag.ilike.%${q}%,type.ilike.%${q}%`);
  }

	if (type) {
	  // partial match like CapsPage filters
	  query = query.ilike("type", `%${type}%`);
	}


  // sorting
  switch (safeSort) {
    case "tag_desc":
      query = query.order("tag", { ascending: false });
      break;
    case "type_asc":
      query = query.order("type", { ascending: true }).order("tag", { ascending: true });
      break;
    case "type_desc":
      query = query.order("type", { ascending: false }).order("tag", { ascending: true });
      break;
    case "tag_asc":
    default:
      query = query.order("tag", { ascending: true });
      break;
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    data: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    totalPages: count != null ? Math.ceil(count / pageSize) : 0,
    sort: safeSort,
    q,
    type,
  });
}
