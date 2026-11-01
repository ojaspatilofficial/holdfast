import { NextResponse } from "next/server";
import { createApproval } from "@/lib/paypal/actions";
import type { ApprovalKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: ApprovalKind[] = ["push_tracking", "provide_evidence", "make_offer", "accept_claim", "refund"];

// Seller-created approvals (from buttons in the UI). They still go through the same queue.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { kind?: ApprovalKind; title?: string; summary?: string; payload?: Record<string, unknown> };
  if (!b.kind || !KINDS.includes(b.kind) || !b.title) return NextResponse.json({ error: "kind and title required" }, { status: 400 });
  const a = createApproval({ kind: b.kind, title: b.title.slice(0, 120), summary: (b.summary ?? "").slice(0, 400), createdBy: "user", payload: b.payload ?? {} });
  return NextResponse.json(a);
}
