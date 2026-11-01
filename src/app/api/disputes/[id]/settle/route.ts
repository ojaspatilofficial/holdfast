import { NextResponse } from "next/server";
import { settleDispute } from "@/lib/paypal/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sandbox-only: force a test dispute's outcome so the demo can finish end to end.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { outcome } = (await req.json().catch(() => ({}))) as { outcome?: "SELLER_FAVOR" | "BUYER_FAVOR" };
  if (outcome !== "SELLER_FAVOR" && outcome !== "BUYER_FAVOR") return NextResponse.json({ error: "outcome required" }, { status: 400 });
  const r = await settleDispute(id, outcome);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
