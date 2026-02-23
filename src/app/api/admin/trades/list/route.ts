import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

const STATUSES = new Set(["pending", "canceled", "completed"]);

const SORT_KEYS = new Set([
  "date_started_desc",
  "date_started_asc",
  "caps_count_desc",
  "caps_count_asc",
  "country_asc",
  "country_desc",
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const limitRaw = Number(url.searchParams.get("limit") || "10");
    const limit = [10, 50, 100].includes(limitRaw) ? limitRaw : 10;

    const statusRaw = String(url.searchParams.get("status") || "pending").trim();
    const status = (STATUSES.has(statusRaw) ? statusRaw : "pending") as "pending" | "canceled" | "completed";

    const sort = String(url.searchParams.get("sort") || "date_started_desc");
    const sortKey = SORT_KEYS.has(sort) ? sort : "date_started_desc";

    const trader = String(url.searchParams.get("trader") || "").trim();
    const type = String(url.searchParams.get("type") || "").trim(); // blind | scan_based | "" (all)
    const country = String(url.searchParams.get("country") || "").trim();

    const traderQ = trader.length >= 2 ? trader : "";
    const countryQ = country.length >= 2 ? country : "";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabaseAdmin
      .from("v_trades_page")
      .select(
        `
        id,
        status,
        trade_type,
        date_started,
        date_canceled,
        date_completed,
        notes,

        trader_id,
        trader_name,
        trader_name_sort,
        trader_country_id,
        trader_country_name,
        trader_country_name_sort,

        caps_count
      `,
        { count: "exact" }
      )
      .eq("status", status);

    // filters
    if (traderQ) q = q.ilike("trader_name_sort", `%${traderQ.toLowerCase()}%`);
    if (countryQ) q = q.ilike("trader_country_name_sort", `%${countryQ.toLowerCase()}%`);
    if (type === "blind" || type === "scan_based") q = q.eq("trade_type", type);

    // sorting
    if (sortKey === "date_started_asc") q = q.order("date_started", { ascending: true });
    else if (sortKey === "date_started_desc") q = q.order("date_started", { ascending: false });
    else if (sortKey === "caps_count_asc") q = q.order("caps_count", { ascending: true }).order("date_started", { ascending: false });
    else if (sortKey === "caps_count_desc") q = q.order("caps_count", { ascending: false }).order("date_started", { ascending: false });
    else if (sortKey === "country_asc") q = q.order("trader_country_name_sort", { ascending: true }).order("date_started", { ascending: false });
    else if (sortKey === "country_desc") q = q.order("trader_country_name_sort", { ascending: false }).order("date_started", { ascending: false });
    else q = q.order("date_started", { ascending: false });

    const { data, error, count } = await q.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Map flat view fields into your UI-friendly shape + expose country name for the new column
    const cleaned = (data ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      trade_type: r.trade_type,
      date_started: r.date_started,
      date_canceled: r.date_canceled,
      date_completed: r.date_completed,
      notes: r.notes,
      caps_count: r.caps_count ?? 0,

      trader: r.trader_id
        ? { id: r.trader_id, name: r.trader_name ?? "", country_id: r.trader_country_id ?? null }
        : null,

      trader_country_name: r.trader_country_name ?? null,
    }));

    return NextResponse.json({
      data: cleaned,
      total: count ?? 0,
      page,
      limit,
      sort: sortKey,
      filters: {
        status,
        trader: traderQ,
        country: countryQ,
        type: type === "blind" || type === "scan_based" ? type : "",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
