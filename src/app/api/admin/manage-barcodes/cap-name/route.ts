import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const beerCapId = Number(url.searchParams.get("beerCapId"));

    if (!Number.isInteger(beerCapId) || beerCapId < 1) {
      return NextResponse.json({ error: "Invalid beerCapId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("beer_caps")
      .select("beer_name")
      .eq("id", beerCapId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    return NextResponse.json({ beer_name: data.beer_name ?? "" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
