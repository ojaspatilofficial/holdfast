import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/paypal/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision } = (await req.json().catch(() => ({}))) as { decision?: "approve" | "reject" };
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  const result = await decideApproval(id, decision);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
