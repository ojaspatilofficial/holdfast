"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LimitationAnalysis } from "@/lib/ai/features";
import { messageOf, postJson } from "@/lib/http";
import type { KitDoc } from "@/lib/types";
import { BTN } from "../ActionButton";
import { SourceTag } from "../ui";
import { Thinking, type AiResult } from "./shared";

const SAMPLE_NOTICE = `We noticed some unusual activity on your account, so we've temporarily limited what you can do with it. To lift the limitation, please provide the following within 10 days:
- Proof of business address (a utility bill dated within the last 3 months)
- Invoices from your suppliers for items sold in the last 60 days
- Proof of delivery for recent transactions
Until then, you won't be able to send or withdraw money. Funds may be held for up to 180 days.`;

export function KitChecklist({ kit }: { kit: KitDoc[] }) {
  const router = useRouter();
  const [items, setItems] = useState(kit);
  async function toggle(id: string, ready: boolean) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ready } : x)));
    await postJson("/api/kit", { id, ready });
    router.refresh();
  }
  const done = items.filter((i) => i.ready).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / items.length) * 100}%` }} /></div>
        <span className="text-xs font-medium text-muted num">{done}/{items.length} ready</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((k) => (
          <li key={k.id} className="flex items-start gap-3 py-2.5">
            <input id={`k-${k.id}`} type="checkbox" checked={k.ready} onChange={(e) => toggle(k.id, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0b5d4b]" />
            <label htmlFor={`k-${k.id}`} className="text-sm">
              <span className={k.ready ? "" : "font-medium"}>{k.label}</span>
              <span className="block text-xs text-muted">{k.why}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LimitationAnalyzer() {
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<AiResult<LimitationAnalysis> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<AiResult<LimitationAnalysis>>("/api/kit/analyze", { notice });
      if (!r.ok) throw new Error(messageOf(r.data, "Request failed"));
      setData(r.data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const v = data?.value;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="notice" className="text-xs font-semibold text-muted">Paste the limitation email or notice</label>
        <button onClick={() => setNotice(SAMPLE_NOTICE)} className="text-xs text-brand hover:underline">Use a sample notice</button>
      </div>
      <textarea id="notice" value={notice} onChange={(e) => setNotice(e.target.value)} rows={6} placeholder="We've limited your account…" className="w-full rounded-lg border border-line p-3 text-sm outline-none focus:border-brand" />
      <button onClick={go} disabled={busy || !notice.trim()} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.primary}`}>{busy ? "Reading notice…" : "Work out what PayPal wants"}</button>
      {busy && <Thinking label="Comparing the notice with your document kit…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {v && data && (
        <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-soft/40 p-4 text-sm">
          {v.deadline && <p><b>Deadline:</b> {v.deadline}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-muted">Ready in your kit</div>
              <ul className="mt-1 space-y-0.5">{v.readyFromKit.map((x, i) => <li key={i} className="text-ok">✓ {x}</li>)}</ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">Still to gather</div>
              <ul className="mt-1 space-y-0.5">{v.missingFromKit.map((x, i) => <li key={i} className="text-warn">○ {x}</li>)}</ul>
            </div>
          </div>
          {v.whatPayPalWants.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted">PayPal is asking for</div>
              <ul className="mt-1 list-disc pl-5">{v.whatPayPalWants.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-muted">Draft response</div>
            <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3">{v.draftResponse}</p>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Don&apos;t</div>
            <ul className="mt-1 list-disc pl-5">{v.cautions.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <SourceTag source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}
