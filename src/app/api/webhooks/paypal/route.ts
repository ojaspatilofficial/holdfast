import { NextResponse } from "next/server";
import { PayPal, paypalConfigured } from "@/lib/paypal/client";
import { upsertPayPalDispute } from "@/lib/paypal/actions";
import { audit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PayPal webhook receiver. Verifies the signature with PayPal (using the raw body and the
// *subscription's* webhook id, the two most common mistakes), then syncs the dispute.
export async function POST(req: Request) {
  const raw = await req.text();
  let event: { id?: string; event_type?: string; resource?: { dispute_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!paypalConfigured()) return NextResponse.json({ error: "Live mode not configured" }, { status: 503 });

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID not set" }, { status: 503 });
  const h = (k: string) => req.headers.get(k) ?? "";
  const verify = await PayPal.verifyWebhook({
    auth_algo: h("paypal-auth-algo"),
    cert_url: h("paypal-cert-url"),
    transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"),
    transmission_time: h("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  }).catch((e: Error) => ({ data: { verification_status: "FAILURE" as const }, trace: undefined, error: e }));

  // A 200 from the verify endpoint can still carry FAILURE, so check the status field.
  if (verify.data.verification_status !== "SUCCESS") {
    audit({ actor: "paypal-webhook", action: "Rejected webhook", detail: `${event.event_type ?? "unknown"}: signature verification failed` });
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  if (event.event_type?.startsWith("CUSTOMER.DISPUTE") && event.resource?.dispute_id) {
    const full = await PayPal.getDispute(event.resource.dispute_id);
    upsertPayPalDispute(full.data);
    audit({ actor: "paypal-webhook", action: event.event_type, detail: `Dispute ${event.resource.dispute_id} synced`, trace: full.trace });
  } else {
    audit({ actor: "paypal-webhook", action: event.event_type ?? "event", detail: `Event ${event.id ?? ""} received` });
  }
  return NextResponse.json({ ok: true });
}
