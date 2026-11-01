import { NextResponse } from "next/server";
import { mutate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id, ready } = (await req.json().catch(() => ({}))) as { id?: string; ready?: boolean };
  const kit = mutate((db) => {
    const k = db.kit.find((x) => x.id === id);
    if (k) k.ready = Boolean(ready);
    return db.kit;
  });
  return NextResponse.json(kit);
}
