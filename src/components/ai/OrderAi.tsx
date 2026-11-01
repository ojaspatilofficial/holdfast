"use client";

import { useState } from "react";
import type { OrderExplanation } from "@/lib/ai/features";
import { SourceTag } from "../ui";
import { RegenButton, Thinking, useAi } from "./shared";

export function OrderAi({ orderId }: { orderId: string }) {
  const { data, busy, err, load } = useAi<OrderExplanation>(`/api/orders/${orderId}/explain`);
  const [copied, setCopied] = useState(false);
  const v = data?.value;
  const sig = v?.buyerSignals;

  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-ink">✦ What this means</h3>
        <RegenButton onClick={() => load(true)} busy={busy} label={data?.source === "rules" ? "Ask Gemini" : "Regenerate"} />
      </div>
      {busy && !data && <Thinking label="Reading the order and buyer messages…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {v && sig && (
        <div className="space-y-3 text-sm">
          <p className="font-medium">{v.headline}</p>
          <p className="text-muted">{v.explanation}</p>
          {v.fixSteps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">
              {v.fixSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {(sig.addressChangeRequested || sig.disputeThreat || sig.summary) && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-1 text-xs font-semibold text-muted">Buyer messages</div>
              {sig.summary && <p>{sig.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sig.addressChangeRequested && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Asked to ship elsewhere{sig.requestedAddress ? `: ${sig.requestedAddress}` : ""}</span>}
                {sig.disputeThreat && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Mentions opening a case</span>}
                <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Urgency: {sig.urgency}</span>
              </div>
            </div>
          )}
          {v.suggestedReply && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
                Suggested reply to buyer
                <button
                  className="text-brand hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(v.suggestedReply);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap">{v.suggestedReply}</p>
            </div>
          )}
          <SourceTag source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}
