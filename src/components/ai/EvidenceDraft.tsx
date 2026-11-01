"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EvidencePack } from "@/lib/ai/features";
import { postJson } from "@/lib/http";
import { BTN } from "../ActionButton";
import { SourceTag } from "../ui";
import { RegenButton, Thinking, useAi } from "./shared";

export function EvidenceDraft({ disputeId, canSubmit }: { disputeId: string; canSubmit: boolean }) {
  const router = useRouter();
  const { data, busy, err, load } = useAi<EvidencePack>(`/api/disputes/${disputeId}/evidence`);
  const [notes, setNotes] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (data) setNotes(data.value.narrative);
  }, [data]);

  async function queue() {
    const r = await postJson("/api/approvals", { kind: "provide_evidence", title: `Submit evidence on ${disputeId}`, summary: notes.slice(0, 160), payload: { disputeId, notes } });
    setQueued(r.ok ? "Queued. Approve it below or on the Approvals page." : "Could not queue.");
    router.refresh();
  }

  const v = data?.value;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">✦ Evidence pack</h3>
        <RegenButton onClick={() => load(true)} busy={busy} />
      </div>
      {busy && !data && <Thinking label="Pulling tracking, delivery scan and messages into a response…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {v && (
        <>
          <p className="text-sm text-muted">{v.summary}</p>
          <label className="block text-xs font-semibold text-muted" htmlFor={`n-${disputeId}`}>Response to PayPal (edit before submitting)</label>
          <textarea id={`n-${disputeId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} className="w-full rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed outline-none focus:border-brand" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Attached evidence</div>
              <ul className="space-y-1 text-sm">
                {v.evidenceList.map((e, i) => (
                  <li key={i} className="flex gap-2"><span className="text-ok">✓</span><span><b className="font-medium">{e.item}</b> <span className="text-muted">· {e.whyItMatters}</span></span></li>
                ))}
              </ul>
            </div>
            {v.missingEvidence.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">Missing</div>
                <ul className="space-y-1 text-sm">
                  {v.missingEvidence.map((m, i) => <li key={i} className="flex gap-2"><span className="text-warn">!</span>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-canvas p-3 text-sm"><span className="text-xs font-semibold text-muted">Message to buyer: </span>{v.buyerMessage}</div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={queue} disabled={!canSubmit || !notes.trim()} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.primary}`}>Queue evidence for approval</button>
            {!canSubmit && <span className="text-xs text-muted">Evidence already submitted or case closed.</span>}
            {queued && <span className="text-xs text-ok">{queued}</span>}
            <SourceTag source={data.source} note={data.note} />
          </div>
        </>
      )}
    </div>
  );
}
