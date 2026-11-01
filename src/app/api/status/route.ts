import { NextResponse } from "next/server";
import { aiConfigured, GEMINI_MODEL } from "@/lib/ai/gemini";
import { paypalConfigured } from "@/lib/paypal/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ paypal: paypalConfigured() ? "sandbox" : "demo", ai: aiConfigured() ? GEMINI_MODEL : "off" });
}
