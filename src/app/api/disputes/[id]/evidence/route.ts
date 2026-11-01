import { NextResponse } from "next/server";
import { draftEvidence } from "@/lib/ai/features";
import { getDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  const d = getDb().disputes.find((x) => x.id === id);
  if (!d) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  return NextResponse.json(await draftEvidence(d, Boolean(force)));
}
