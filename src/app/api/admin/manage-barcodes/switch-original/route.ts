import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";

    if (!/^[A-Za-z0-9]{3}$/.test(barcode)) {
      return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
    }

    // 1) Read status to decide if UI should allow switch
    const st = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("id, beer_cap_id, control_bar")
      .eq("barcode", barcode)
      .maybeSingle();

    if (st.error) return NextResponse.json({ error: st.error.message }, { status: 400 });
    if (!st.data) return NextResponse.json({ error: "Barcode not found" }, { status: 404 });

    const { id, beer_cap_id, control_bar } = st.data;

    // If caller only wants status, return it
    const confirm = body?.confirm === true;
    if (!confirm) {
      return NextResponse.json({
        ok: true,
        mode: "status",
        id,
        beerCapId: beer_cap_id,
        control_bar,
        canSwitch: control_bar === 2,
        reason:
          control_bar === 2
            ? null
            : control_bar === 1
            ? "Already original"
            : control_bar === 3
            ? "Pending trade"
            : control_bar === 0
            ? "Unassigned token"
            : "Unknown state",
      });
    }

    // 2) Confirmed: must be control 2
    if (control_bar !== 2) {
      return NextResponse.json(
        { error: "Switch not allowed for this barcode state", control_bar },
        { status: 409 }
      );
    }

    // Atomic swap inside DB
    const rpc = await supabaseAdmin.rpc("switch_original_barcode", { p_barcode: barcode });

    if (rpc.error) {
      return NextResponse.json({ error: rpc.error.message }, { status: 400 });
    }

    return NextResponse.json(rpc.data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
