import { NextResponse } from "next/server";
import { paypalConfigured } from "@/lib/paypal/client";
import { captureTestCheckout } from "@/lib/paypal/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PayPal redirects here after the sandbox buyer approves a test checkout (?token=ORDER_ID).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const origin = process.env.PUBLIC_URL || url.origin;
  if (!paypalConfigured()) return NextResponse.redirect(`${origin}/settings?error=paypal_not_configured`);
  if (!token) return NextResponse.redirect(`${origin}/settings`);
  try {
    const id = await captureTestCheckout(token);
    return NextResponse.redirect(`${origin}/orders/${id}`);
  } catch (e) {
    return NextResponse.redirect(`${origin}/settings?error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
}
