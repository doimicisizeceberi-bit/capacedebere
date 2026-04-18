import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type InputRow = {
  beer_name: string;
  cap_no: number;
  cap_country: number;
  sheet?: string | null;
  trade_type: string;
  issued_year?: number | null;
  source: number;
  entry_date?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: InputRow[] = body?.caps ?? [];

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid payload." },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows provided." },
        { status: 400 }
      );
    }

    if (rows.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 rows allowed." },
        { status: 400 }
      );
    }

    const prepared: any[] = [];

    for (const r of rows) {
      const cleanBeer = String(r.beer_name ?? "").trim();

      if (!cleanBeer) {
        return NextResponse.json(
          { error: "Beer name is required." },
          { status: 400 }
        );
      }

      if (!Number.isInteger(r.cap_no) || r.cap_no < 1) {
        return NextResponse.json(
          { error: "cap_no must be a positive integer." },
          { status: 400 }
        );
      }

      if (!r.cap_country || !r.trade_type || !r.source) {
        return NextResponse.json(
          { error: "Missing required fields." },
          { status: 400 }
        );
      }

		const yearVal =
		  r.issued_year == null
			? null
			: Number.parseInt(String(r.issued_year), 10);

      if (
        yearVal !== null &&
        (!Number.isFinite(yearVal) || String(yearVal).length !== 4)
      ) {
        return NextResponse.json(
          { error: "Issued year must be 4 digits (or empty)." },
          { status: 400 }
        );
      }

      let entryDateVal: string;

      if (!r.entry_date || String(r.entry_date).trim() === "") {
        entryDateVal = new Date().toISOString().slice(0, 10);
      } else {
        const clean = String(r.entry_date).trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
          return NextResponse.json(
            { error: "Entry date must be YYYY-MM-DD." },
            { status: 400 }
          );
        }

        entryDateVal = clean;
      }

      prepared.push({
        beer_name: cleanBeer,
        cap_no: r.cap_no,
        cap_country: r.cap_country,
        sheet: r.sheet ? String(r.sheet).trim() : null,
        trade_type: r.trade_type,
        issued_year: yearVal,
        source: r.source,
        entry_date: entryDateVal,
      });
    }

    const { error } = await supabaseAdmin
      .from("beer_caps")
      .insert(prepared);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}