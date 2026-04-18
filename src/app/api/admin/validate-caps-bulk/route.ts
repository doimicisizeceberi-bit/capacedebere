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
  cap_country: number;
  beer_name: string;
  cap_no: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: InputRow[] = body?.rows ?? [];

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid payload." },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    if (rows.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 rows allowed." },
        { status: 400 }
      );
    }

    // normalize
    const normalized = rows.map((r, index) => {
      const cleanBeer = String(r.beer_name ?? "").trim();

      return {
        index,
        cap_country: Number(r.cap_country),
        beer_name: cleanBeer,
        cap_no: Number(r.cap_no),
      };
    });

    // build tuple list
    const tuples = normalized
      .map(
        (r) =>
          `(${r.cap_country}, '${r.beer_name.replace(/'/g, "''")}', ${r.cap_no})`
      )
      .join(",");

    // query existing conflicts
    const query = `
      SELECT cap_country, beer_name, cap_no
      FROM beer_caps
      WHERE (cap_country, beer_name, cap_no) IN (${tuples})
    `;

    const { data, error } = await supabaseAdmin.rpc("pgexec", {
      query,
    });

    // fallback if rpc not available
    let existing: any[] = [];
    if (error) {
      // fallback using standard select (less efficient but safe)
      const orFilters = normalized
        .map(
          (r) =>
            `(cap_country.eq.${r.cap_country},beer_name.eq.${r.beer_name},cap_no.eq.${r.cap_no})`
        )
        .join(",");

      const res = await supabaseAdmin
        .from("beer_caps")
        .select("cap_country, beer_name, cap_no")
        .or(orFilters);

      if (res.error) {
        return NextResponse.json(
          { error: res.error.message },
          { status: 400 }
        );
      }

      existing = res.data || [];
    } else {
      existing = data || [];
    }

    // map conflicts back to rows
    const conflicts: { index: number; reason: string }[] = [];

    for (const row of normalized) {
      const found = existing.find(
        (e) =>
          e.cap_country === row.cap_country &&
          e.beer_name === row.beer_name &&
          e.cap_no === row.cap_no
      );

      if (found) {
        conflicts.push({
          index: row.index,
          reason: "exists_in_db",
        });
      }
    }

    return NextResponse.json({ conflicts });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}