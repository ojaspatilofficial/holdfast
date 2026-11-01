import { NextResponse } from "next/server";
import { createTestCheckout } from "@/lib/paypal/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const origin = process.env.PUBLIC_URL || new URL(req.url).origin;
  const r = await createTestCheckout(origin);
  return NextResponse.json(r.ok ? { ...r, message: "Opening PayPal…" } : r, { status: r.ok ? 200 : 409 });
}
