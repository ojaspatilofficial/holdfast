import { NextResponse } from "next/server";
import { syncFromPayPal } from "@/lib/paypal/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const r = await syncFromPayPal();
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
