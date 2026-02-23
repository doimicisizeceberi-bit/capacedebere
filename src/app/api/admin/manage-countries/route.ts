import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type SortKey =
  | "id_asc"
  | "id_desc"
  | "country_asc"
  | "country_desc"
  | "abb_asc"
  | "abb_desc"
  | "active_asc"
  | "active_desc";

const SORT_KEYS = new Set<SortKey>([
  "id_asc",
  "id_desc",
  "country_asc",
  "country_desc",
  "abb_asc",
  "abb_desc",
  "active_asc",
  "active_desc",
]);

function parseIntSafe(x: string | null, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normText(x: any) {
  return String(x ?? "").trim();
}

function normAbb(x: any) {
  return String(x ?? "").trim().toUpperCase();
}

function validateName(name: string) {
  if (!name) return "Country name is required.";
  if (name.length < 2) return "Country name must be at least 2 characters.";
  if (name.length > 120) return "Country name is too long.";
  return null;
}

function validateAbb(abb: string) {
  if (!abb) return "Abbreviation is required.";
  // CAPS and '-' (allow 2..10)
  if (!/^[A-Z-]{2,10}$/.test(abb)) {
    return "Abbreviation must be 2–10 chars, only A–Z and '-'.";
  }
  return null;
}

function uniqueConflictField(err: any): { field: "country_name_full" | "country_name_abb" | null } {
  const msg = String(err?.message ?? "");
  if (msg.includes("caps_country_country_name_full_key")) return { field: "country_name_full" };
  if (msg.includes("caps_country_country_name_abb_key")) return { field: "country_name_abb" };
  return { field: null };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const page = parseIntSafe(url.searchParams.get("page"), 1);
    const limit = Math.min(parseIntSafe(url.searchParams.get("limit"), 50), 200);

    const sortRaw = (url.searchParams.get("sort") ?? "country_asc") as SortKey;
    const sort: SortKey = SORT_KEYS.has(sortRaw) ? sortRaw : "country_asc";

    const country = normText(url.searchParams.get("country"));
    const abb = normAbb(url.searchParams.get("abb"));

    const activeParam = normText(url.searchParams.get("active")); // "all" | "true" | "false"
    const activeFilter =
      activeParam === "true" ? true : activeParam === "false" ? false : null;

    let q = supabaseAdmin
      .from("caps_country")
      .select("id,country_name_full,country_name_abb,active", { count: "exact" });

    if (country) q = q.ilike("country_name_full", `%${country}%`);
    if (abb) q = q.ilike("country_name_abb", `%${abb}%`);
    if (activeFilter !== null) q = q.eq("active", activeFilter);

    const [sortField, sortDir] = sort.split("_") as [
      "id" | "country" | "abb" | "active",
      "asc" | "desc",
    ];

    const orderCol =
      sortField === "country"
        ? "country_name_full"
        : sortField === "abb"
          ? "country_name_abb"
          : sortField === "active"
            ? "active"
            : "id";

    q = q.order(orderCol, { ascending: sortDir === "asc", nullsFirst: false });

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await q.range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
      sort,
      filters: {
        country,
        abb,
        active: activeFilter === null ? "all" : String(activeFilter),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const country_name_full = normText(body?.country_name_full);
    const country_name_abb = normAbb(body?.country_name_abb);

    const nameErr = validateName(country_name_full);
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });

    const abbErr = validateAbb(country_name_abb);
    if (abbErr) return NextResponse.json({ error: abbErr }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("caps_country")
      .insert([{ country_name_full, country_name_abb, active: true }])
      .select("id,country_name_full,country_name_abb,active")
      .single();

    if (error) {
      if (String(error.code) === "23505") {
        const which = uniqueConflictField(error);
        return NextResponse.json(
          { error: "Duplicate value. Name and abbreviation must be unique.", field: which.field },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const patch: any = {};

    if (body?.country_name_full !== undefined) {
      const v = normText(body.country_name_full);
      const err = validateName(v);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      patch.country_name_full = v;
    }

    if (body?.country_name_abb !== undefined) {
      const v = normAbb(body.country_name_abb);
      const err = validateAbb(v);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      patch.country_name_abb = v;
    }

    if (body?.active !== undefined) {
      patch.active = Boolean(body.active);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("caps_country")
      .update(patch)
      .eq("id", id)
      .select("id,country_name_full,country_name_abb,active")
      .single();

    if (error) {
      if (String(error.code) === "23505") {
        const which = uniqueConflictField(error);
        return NextResponse.json(
          { error: "Duplicate value. Name and abbreviation must be unique.", field: which.field },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}