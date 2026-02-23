import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

// Base62 alphabet (order matters forever)
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE = ALPHABET.length; // 62
const MAX = BASE * BASE * BASE - 1; // 238327

function codeToNumber(code: string): number {
  if (!/^[A-Za-z0-9]{3}$/.test(code)) throw new Error("Bad barcode format in DB");
  const a = ALPHABET.indexOf(code[0]);
  const b = ALPHABET.indexOf(code[1]);
  const c = ALPHABET.indexOf(code[2]);
  if (a < 0 || b < 0 || c < 0) throw new Error("Bad barcode character in DB");
  return a * BASE * BASE + b * BASE + c;
}

function numberToCode(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX) throw new Error("Barcode space exhausted");
  const a = Math.floor(n / (BASE * BASE));
  const rem = n % (BASE * BASE);
  const b = Math.floor(rem / BASE);
  const c = rem % BASE;
  return ALPHABET[a] + ALPHABET[b] + ALPHABET[c];
}

async function getLastBarcode(): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin
    .from("beer_caps_barcodes")
    .select("barcode")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.barcode as string | undefined;
}


async function capHasOriginal(beerCapId: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("beer_caps_barcodes")
    .select("id")
    .eq("beer_cap_id", beerCapId)
    .eq("control_bar", 1)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function findFreeToken(): Promise<{ id: number; barcode: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("beer_caps_barcodes")
    .select("id, barcode")
    .eq("control_bar", 0)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? ({ id: data.id, barcode: data.barcode } as any) : null;
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

    // confirm cap exists + read its sheet (default for originals)
    const capRes = await supabaseAdmin
      .from("beer_caps")
      .select("id, sheet")
      .eq("id", beerCapId)
      .maybeSingle();

    if (capRes.error) return NextResponse.json({ error: capRes.error.message }, { status: 400 });
    if (!capRes.data) return NextResponse.json({ error: "Cap not found" }, { status: 404 });

    const capSheet = capRes.data.sheet ?? null;

    // determine control_bar based on whether an original already exists
    const hasOriginal = await capHasOriginal(beerCapId);
    const control_bar: 1 | 2 = hasOriginal ? 2 : 1;

    // sheet rule: originals copy from beer_caps.sheet; duplicates use user input
    const sheetToStore = control_bar === 1 ? capSheet : sheet;

    // 1) Reuse a free token if available
    const free = await findFreeToken();
    if (free) {
      // Update the token row to assign it to this cap design
      const upd = await supabaseAdmin
        .from("beer_caps_barcodes")
        .update({
          beer_cap_id: beerCapId,
          sheet: sheetToStore,
          control_bar,
        })
        .eq("id", free.id)
        .eq("control_bar", 0); // safety check

      if (!upd.error) {
        return NextResponse.json({ ok: true, barcode: free.barcode, beerCapId, control_bar, reused: true });
      }

      // If update failed for concurrency reasons, fall through to new allocation
    }

    // 2) Allocate a brand new barcode row (insert + retry on collision)
    for (let attempt = 0; attempt < 8; attempt++) {
      const last = await getLastBarcode();
      const nextNum = last ? codeToNumber(last) + 1 : 0;
      const next = numberToCode(nextNum);

      const ins = await supabaseAdmin.from("beer_caps_barcodes").insert({
        beer_cap_id: beerCapId,
        barcode: next,
        sheet: sheetToStore,
        control_bar,
      });

      if (!ins.error) {
        return NextResponse.json({ ok: true, barcode: next, beerCapId, control_bar, reused: false });
      }

      const msg = ins.error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) continue;

      return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Could not allocate a unique barcode (try again)" }, { status: 409 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
