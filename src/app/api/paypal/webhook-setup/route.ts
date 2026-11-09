import { NextResponse } from "next/server";
import { PayPal, paypalConfigured } from "@/lib/paypal/client";
import { audit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS = ["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED", "PAYMENT.CAPTURE.COMPLETED"];

// Registers this deployment's webhook URL with PayPal. Needs a public HTTPS URL (PUBLIC_URL).
export async function POST(req: Request) {
  if (!paypalConfigured()) return NextResponse.json({ ok: false, message: "Add PayPal sandbox keys first." }, { status: 409 });
  const origin = (process.env.PUBLIC_URL || new URL(req.url).origin).trim().replace(/\/+$/, "");
  if (!origin.startsWith("https://") || origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return NextResponse.json({
      ok: false,
      message: `PayPal webhooks require a public HTTPS URL (e.g. https://holdfast-xxxx.onrender.com). PayPal cannot reach localhost (${origin}). When running locally, use "Sync from PayPal" on the Disputes page instead. Register webhooks after deploying to Render.`,
    }, { status: 409 });
  }
  try {
    const r = await PayPal.createWebhook(`${origin}/api/webhooks/paypal`, EVENTS);
    audit({ actor: "system", action: "Webhook created", detail: `id ${r.data.id}`, trace: r.trace });
    return NextResponse.json({ ok: true, message: `Webhook created. Set PAYPAL_WEBHOOK_ID=${r.data.id} in your environment (e.g. Render) and restart.`, id: r.data.id });
  } catch (e) {
    const err = e as { message?: string; body?: { details?: { issue?: string; description?: string }[] } };
    const detail = err.body?.details?.[0]?.description || err.body?.details?.[0]?.issue;
    const msg = detail ? `${err.message || "Failed"} (${detail})` : (err.message || "Could not register webhook.");
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }
}
