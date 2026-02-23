import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function controlLabel(n: number) {
  if (n === 0) return "0 (free token)";
  if (n === 1) return "1 (original)";
  if (n === 2) return "2 (duplicate)";
  if (n === 3) return "3 (reserved for trade)";
  return `${n} (unknown)`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const barcode = String(url.searchParams.get("barcode") || "").trim();

    if (!/^[A-Za-z0-9]{3}$/.test(barcode)) {
      return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
    }

    // Read barcode instance
    const instRes = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, barcode, beer_cap_id, sheet, control_bar")
      .eq("barcode", barcode)
      .maybeSingle();

    if (instRes.error) return NextResponse.json({ error: instRes.error.message }, { status: 400 });
    if (!instRes.data) return NextResponse.json({ error: "Barcode not found" }, { status: 404 });

    const inst = instRes.data as {
      id: number;
      barcode: string;
      beer_cap_id: number | null;
      sheet: string | null;
      control_bar: number;
    };

    // If token is free/unassigned, return only instance info
    if (inst.control_bar === 0 || inst.beer_cap_id == null) {
      return NextResponse.json({
        instance: {
          id: inst.id,
          barcode: inst.barcode,
          beer_cap_id: inst.beer_cap_id,
          sheet: inst.sheet,
          control_bar: inst.control_bar,
          control_label: controlLabel(inst.control_bar),
        },
        cap: null,
      });
    }

    // Fetch cap details (same fields you show in caps/page.tsx details)
    const capRes = await supabaseAdmin
      .from("v_caps_page")
      .select(`
        id,
        beer_name,
        cap_no,
        sheet,
        entry_date,
        issued_year,
        caps_country,
        caps_sources,
        photo_caps,
        beer_caps_tags
      `)
      .eq("id", inst.beer_cap_id)
      .maybeSingle();

    if (capRes.error) return NextResponse.json({ error: capRes.error.message }, { status: 400 });

    return NextResponse.json({
      instance: {
        id: inst.id,
        barcode: inst.barcode,
        beer_cap_id: inst.beer_cap_id,
        sheet: inst.sheet,
        control_bar: inst.control_bar,
        control_label: controlLabel(inst.control_bar),
      },
      cap: capRes.data ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
