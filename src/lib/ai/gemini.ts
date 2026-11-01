// Gemini (free tier) wrapper: JSON-schema outputs, a request gap to stay under free-tier
// rate limits, and a cache so the same question is never paid for twice.
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getDb, mutate } from "../store";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const g = globalThis as unknown as { __genai?: GoogleGenAI; __genaiLast?: number };

export function genai() {
  if (!g.__genai) g.__genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return g.__genai;
}

/** Free tier allows only a handful of requests per minute, so space calls out. */
export async function aiGap() {
  const minGap = Number(process.env.GEMINI_MIN_GAP_MS || 4000);
  const now = Date.now();
  const wait = (g.__genaiLast ?? 0) + minGap - now;
  g.__genaiLast = Math.max(now, (g.__genaiLast ?? 0) + minGap);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface AiOutcome<T> {
  value: T;
  source: "gemini" | "cache" | "rules";
  note?: string;
}

export const SYSTEM_BASE = `You are Holdfast, a calm, precise assistant for small online sellers who get paid with PayPal.
Facts you can rely on:
- PayPal US Seller Protection covers only "Item Not Received" and "Unauthorized Transaction" claims, for tangible goods shipped to the address on the PayPal Transaction Details page, with online tracking that shows delivery. "Significantly Not As Described" claims are not covered.
- Sellers have about 10 days to respond to a dispute, or it closes in the buyer's favour.
- Sending tracking to PayPal is the documented way to release funds on hold; funds release once delivery is confirmed.
- Disputes cost a fee ($15, or $30 above ~1.5% dispute rate) that is not returned.
Rules: never invent order data, tracking numbers or policies. Use only the data given. Write in plain English for a non-expert, short sentences, no legal advice. Coverage verdicts are decided by Holdfast's rules engine; explain them, never override them.`;

function jsonSchema(schema: z.ZodType) {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  return rest;
}

/** Ask Gemini for JSON matching a zod schema. Falls back to `fallback()` when AI is off or fails. */
export async function generateJson<T>(opts: {
  cacheKey: string;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  fallback: () => T;
  force?: boolean;
}): Promise<AiOutcome<T>> {
  const cached = getDb().aiCache[opts.cacheKey];
  if (cached && !opts.force) return { value: cached.value as T, source: "cache" };
  if (!aiConfigured()) return { value: opts.fallback(), source: "rules", note: "AI is off (no GEMINI_API_KEY). Showing rule-based text." };
  try {
    await aiGap();
    const res = await genai().models.generateContent({
      model: GEMINI_MODEL,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system ?? SYSTEM_BASE,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(opts.schema),
      },
    });
    const parsed = opts.schema.parse(JSON.parse(res.text ?? "{}"));
    mutate((db) => {
      db.aiCache[opts.cacheKey] = { at: new Date().toISOString(), value: parsed };
    });
    return { value: parsed, source: "gemini" };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    const busy = /429|quota|RESOURCE_EXHAUSTED/i.test(msg);
    console.warn("[holdfast] gemini failed:", msg.slice(0, 300));
    return { value: opts.fallback(), source: "rules", note: busy ? "Gemini free-tier limit reached; showing rule-based text. Try again in a minute." : "Gemini call failed; showing rule-based text." };
  }
}
