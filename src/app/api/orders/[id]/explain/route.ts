import { NextResponse } from "next/server";
import { explainOrder } from "@/lib/ai/features";
import { getDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  const order = getDb().orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(await explainOrder(order, Boolean(force)));
}
