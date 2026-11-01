import { NextResponse } from "next/server";
import { audit, getDb, mutate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seller-side fixes made before shipping (label changes live in the seller's shipping tool;
// Holdfast records them). These never call PayPal.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const order = getDb().orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  let message = "";
  mutate((db) => {
    const o = db.orders.find((x) => x.id === id)!;
    if (action === "fix_address") {
      o.shipment = { carrier: o.shipment?.carrier ?? "USPS", trackingNumber: o.shipment?.trackingNumber ?? "", signatureRequired: o.shipment?.signatureRequired ?? false, shippedAt: o.shipment?.shippedAt ?? "", labelAddress: { ...o.shipTo }, deliveredAt: o.shipment?.deliveredAt, lastScan: o.shipment?.lastScan };
      message = "Label now goes to the address on the PayPal transaction.";
    } else if (action === "require_signature") {
      if (o.shipment) o.shipment.signatureRequired = true;
      else o.shipment = { carrier: "UPS", trackingNumber: "", signatureRequired: true, shippedAt: "", labelAddress: { ...o.shipTo } };
      message = "Signature confirmation added to the label.";
    } else if (action === "use_tracked_carrier") {
      if (o.shipment) o.shipment.carrier = o.shipTo.country === "US" ? "USPS" : "DHL";
      message = "Switched to a tracked service with a delivery scan.";
    } else if (action === "ship_now") {
      const label = o.shipment?.labelAddress ?? { ...o.shipTo };
      o.shipment = { carrier: o.shipment?.carrier && o.shipment.carrier !== "OTHER" ? o.shipment.carrier : "USPS", trackingNumber: `9400${Date.now().toString().slice(-12)}`, labelAddress: label, signatureRequired: o.shipment?.signatureRequired ?? false, shippedAt: new Date().toISOString(), lastScan: "Label created, accepted at origin" };
      message = "Marked shipped. Next: send the tracking to PayPal.";
    } else {
      message = "";
    }
  });
  if (!message) return NextResponse.json({ error: "Unknown fix" }, { status: 400 });
  audit({ actor: "seller", action: "Pre-ship fix", detail: `${id}: ${message}` });
  return NextResponse.json({ ok: true, message });
}
