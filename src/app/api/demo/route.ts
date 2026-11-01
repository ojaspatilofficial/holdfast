import { NextResponse } from "next/server";
import { simulateIncomingDispute } from "@/lib/paypal/actions";
import { resetDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "reset") {
    const db = resetDb();
    return NextResponse.json({ ok: true, message: `Demo reset: ${db.orders.length} orders, ${db.disputes.length} disputes.` });
  }
  if (action === "simulate_dispute") {
    const d = simulateIncomingDispute();
    return d
      ? NextResponse.json({ ok: true, message: `New dispute ${d.id} arrived ($${d.amount}).`, disputeId: d.id })
      : NextResponse.json({ ok: false, message: "No eligible order to simulate a dispute on." }, { status: 409 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
