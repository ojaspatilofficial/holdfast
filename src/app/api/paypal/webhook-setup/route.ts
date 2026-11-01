import { NextResponse } from "next/server";
import { PayPal, paypalConfigured } from "@/lib/paypal/client";
import { audit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS = ["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED", "PAYMENT.CAPTURE.COMPLETED"];

// Registers this deployment's webhook URL with PayPal. Needs a public HTTPS URL (PUBLIC_URL).
export async function POST(req: Request) {
  if (!paypalConfigured()) return NextResponse.json({ ok: false, message: "Add PayPal sandbox keys first." }, { status: 409 });
  const origin = process.env.PUBLIC_URL || new URL(req.url).origin;
  if (!origin.startsWith("https://")) return NextResponse.json({ ok: false, message: `PayPal needs an HTTPS URL; this app is at ${origin}. Deploy it (e.g. Render) and set PUBLIC_URL.` }, { status: 409 });
  try {
    const r = await PayPal.createWebhook(`${origin}/api/webhooks/paypal`, EVENTS);
    audit({ actor: "system", action: "Webhook created", detail: `id ${r.data.id}`, trace: r.trace });
    return NextResponse.json({ ok: true, message: `Webhook created. Set PAYPAL_WEBHOOK_ID=${r.data.id} and restart.`, id: r.data.id });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 409 });
  }
}
