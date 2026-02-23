import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

function codeToNumber(code: string) {
  // AAA000
  const m = /^([A-Z]{3})(\d{3})$/.exec(code);
  if (!m) throw new Error("Bad barcode format in DB");
  const letters = m[1];
  const digits = Number(m[2]);

  const a = letters.charCodeAt(0) - 65;
  const b = letters.charCodeAt(1) - 65;
  const c = letters.charCodeAt(2) - 65;

  const lettersIndex = a * 26 * 26 + b * 26 + c; // 0..17575
  return lettersIndex * 1000 + digits;
}

function numberToCode(n: number) {
  const max = 26 * 26 * 26 * 1000 - 1;
  if (n < 0 || n > max) throw new Error("Barcode space exhausted");

  const lettersIndex = Math.floor(n / 1000);
  const digits = n % 1000;

  const a = Math.floor(lettersIndex / (26 * 26));
  const b = Math.floor((lettersIndex % (26 * 26)) / 26);
  const c = lettersIndex % 26;

  const letters =
    String.fromCharCode(65 + a) +
    String.fromCharCode(65 + b) +
    String.fromCharCode(65 + c);

  return `${letters}${String(digits).padStart(3, "0")}`;
}

async function getLastBarcode() {
  const { data, error } = await supabaseAdmin
    .from("beer_caps_barcodes")
    .select("barcode")
    .order("barcode", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.barcode as string | undefined;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const beerCapId = Number(body?.beerCapId);
    const sheetInput = typeof body?.sheet === "string" ? body.sheet.trim() : "";
    const sheet = sheetInput === "" ? null : sheetInput;

    if (!Number.isInteger(beerCapId) || beerCapId < 1) {
      return NextResponse.json({ error: "Invalid beerCapId" }, { status: 400 });
    }

    // confirm cap exists + read its sheet (default for first barcode)
    const capRes = await supabaseAdmin
      .from("beer_caps")
      .select("id, sheet")
      .eq("id", beerCapId)
      .maybeSingle();

    if (capRes.error) {
      return NextResponse.json({ error: capRes.error.message }, { status: 400 });
    }

    if (!capRes.data) {
      return NextResponse.json({ error: "Cap not found" }, { status: 404 });
    }

    const capSheet = capRes.data.sheet ?? null;

    // check if this cap already has a barcode
    const existing = await supabaseAdmin
      .from("beer_caps_barcodes")
      .select("barcode")
      .eq("beer_cap_id", beerCapId)
      .limit(1);

    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 400 });
    }

    const isFirstBarcode = (existing.data?.length ?? 0) === 0;

    // First barcode → copy from beer_caps.sheet
    // Copy barcode → use user input (can be null)
    const sheetToStore = isFirstBarcode ? capSheet : sheet;

    // retry loop to handle rare collisions
    for (let attempt = 0; attempt < 6; attempt++) {
      const last = await getLastBarcode();
      const nextNum = last ? codeToNumber(last) + 1 : codeToNumber("AAA000");
      const next = numberToCode(nextNum);

      const ins = await supabaseAdmin
        .from("beer_caps_barcodes")
        .insert({ beer_cap_id: beerCapId, barcode: next, sheet: sheetToStore });

      if (!ins.error) {
        return NextResponse.json({ ok: true, barcode: next, beerCapId });
      }

      const msg = ins.error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) continue;

      return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Could not allocate a unique barcode (try again)" },
      { status: 409 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
