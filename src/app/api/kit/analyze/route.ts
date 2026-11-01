import { NextResponse } from "next/server";
import { analyzeLimitation } from "@/lib/ai/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { notice } = (await req.json().catch(() => ({}))) as { notice?: string };
  if (!notice?.trim()) return NextResponse.json({ error: "Paste the notice text first." }, { status: 400 });
  return NextResponse.json(await analyzeLimitation(notice));
}
