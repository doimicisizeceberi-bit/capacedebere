import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      beer_name,
      cap_no,
      cap_country,
      sheet,
      trade_type,
      issued_year,
      source, // REQUIRED
    } = body ?? {};

    // ---------- Basic validation ----------
    if (!beer_name || !cap_no || !cap_country || !trade_type || !source) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const cleanBeer = String(beer_name).trim();

    if (!cleanBeer) {
      return NextResponse.json(
        { error: "Beer name is required." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(cap_no) || cap_no < 1) {
      return NextResponse.json(
        { error: "cap_no must be a positive integer." },
        { status: 400 }
      );
    }

    const yearVal =
      issued_year == null || issued_year === ""
        ? null
        : Number.parseInt(String(issued_year), 10);

    if (
      yearVal !== null &&
      (!Number.isFinite(yearVal) || String(yearVal).length !== 4)
    ) {
      return NextResponse.json(
        { error: "Issued year must be 4 digits (or empty)." },
        { status: 400 }
      );
    }

    // ---------- Insert ----------
    const { data, error } = await supabaseAdmin
      .from("beer_caps")
      .insert({
        beer_name: cleanBeer,
        cap_no,
        cap_country,
        sheet: sheet ? String(sheet).trim() : null,
        trade_type,
        issued_year: yearVal,
        source, // mandatory FK
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
