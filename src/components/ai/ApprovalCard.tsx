"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/http";
import type { Approval } from "@/lib/types";
import { BTN } from "../ActionButton";

const KIND_LABEL: Record<Approval["kind"], string> = {
  push_tracking: "Send tracking",
  provide_evidence: "Submit evidence",
  make_offer: "Partial offer",
  accept_claim: "Accept claim",
  refund: "Refund",
};

const TONE: Record<Approval["status"], string> = {
  pending: "border-warn/40 bg-warn-soft/40",
  approved: "border-info/30 bg-info-soft/40",
  executed: "border-ok/30 bg-ok-soft/40",
  failed: "border-bad/30 bg-bad-soft/40",
  rejected: "border-line bg-surface",
};

export function ApprovalCard({ a, compact = false }: { a: Approval; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(a.result ? { ok: a.status === "executed", message: a.result } : null);
  const [status, setStatus] = useState(a.status);

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    const r = await postJson<{ ok: boolean; message: string; approval?: Approval }>(`/api/approvals/${a.id}`, { decision });
    setRes({ ok: r.data.ok, message: r.data.message });
    setStatus(r.data.approval?.status ?? (decision === "reject" ? "rejected" : r.data.ok ? "executed" : "failed"));
    setBusy(null);
    router.refresh();
  }

  return (
    <div className={`rounded-xl border p-3 ${TONE[status]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{KIND_LABEL[a.kind]}</span>
        <span className="text-sm font-medium">{a.title}</span>
        <span className="ml-auto text-[11px] text-faint">{a.createdBy === "agent" ? "Proposed by agent" : "Created by you"}</span>
      </div>
      {!compact && a.summary && <p className="mt-1.5 text-sm text-muted">{a.summary}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status === "pending" ? (
          <>
            <button onClick={() => decide("approve")} disabled={Boolean(busy)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.primary}`}>{busy === "approve" ? "Sending to PayPal…" : "Approve & send"}</button>
            <button onClick={() => decide("reject")} disabled={Boolean(busy)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.secondary}`}>Reject</button>
          </>
        ) : (
          <span className={`text-xs font-semibold uppercase ${status === "executed" ? "text-ok" : status === "failed" ? "text-bad" : "text-muted"}`}>{status === "approved" ? "sending…" : status}</span>
        )}
        {res && <span className={`text-xs ${res.ok ? "text-ok" : "text-bad"}`}>{res.message}</span>}
      </div>
    </div>
  );
}
