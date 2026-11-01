import { NextResponse } from "next/server";
import { healthBrief } from "@/lib/ai/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  return NextResponse.json(await healthBrief(Boolean(force)));
}
