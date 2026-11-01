import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { audit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { goal } = (await req.json().catch(() => ({}))) as { goal?: string };
  const g = (goal ?? "").trim().slice(0, 500);
  if (!g) return NextResponse.json({ error: "Tell the agent what to do." }, { status: 400 });
  const run = await runAgent(g);
  audit({ actor: "agent", action: "Agent run", detail: `“${g}” → ${run.approvals.length} approval(s) queued (${run.source})` });
  return NextResponse.json(run);
}
