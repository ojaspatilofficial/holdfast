import { NextResponse } from "next/server";
import { backDemoWithSandbox } from "@/lib/paypal/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const r = await backDemoWithSandbox();
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
