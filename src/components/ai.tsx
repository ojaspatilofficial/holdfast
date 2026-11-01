"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { EvidencePack, HealthBrief, LimitationAnalysis, OrderExplanation } from "@/lib/ai/features";
import type { AgentRun } from "@/lib/ai/agent";
import type { Approval, KitDoc } from "@/lib/types";
import { BTN } from "./ActionButton";

type Src = "gemini" | "cache" | "rules";
interface Outcome<T> { value: T; source: Src; note?: string }

function useAi<T>(endpoint: string, auto = true) {
  const [data, setData] = useState<Outcome<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(
    async (force = false) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        setData(json);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [endpoint],
  );
  useEffect(() => {
    if (auto) void load(false);
  }, [auto, load]);
  return { data, busy, err, load };
}

function Source({ source, note }: { source: Src; note?: string }) {
  const label = source === "gemini" ? "Written by Gemini" : source === "cache" ? "Gemini · saved" : "Rule-based fallback";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
      <span className={`h-1.5 w-1.5 rounded-full ${source === "rules" ? "bg-faint" : "bg-brand"}`} />
      {label}
      {note && <span className="text-warn">· {note}</span>}
    </span>
  );
}

function Thinking({ label = "Thinking…" }: { label?: string }) {
  return (
    <div className="space-y-2 py-1" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" /> {label}
      </div>
      <div className="h-3 w-3/4 animate-pulse rounded bg-canvas" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-canvas" />
    </div>
  );
}

// ---------- Order explanation ----------

export function OrderAi({ orderId }: { orderId: string }) {
  const { data, busy, err, load } = useAi<OrderExplanation>(`/api/orders/${orderId}/explain`);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-ink">✦ What this means</h3>
        <button onClick={() => load(true)} disabled={busy} className="text-xs text-brand hover:underline disabled:opacity-50">Regenerate</button>
      </div>
      {busy && !data && <Thinking label="Reading the order and buyer messages…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {data && (
        <div className="space-y-3 text-sm">
          <p className="font-medium">{data.value.headline}</p>
          <p className="text-muted">{data.value.explanation}</p>
          {data.value.fixSteps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">
              {data.value.fixSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {(data.value.buyerSignals.addressChangeRequested || data.value.buyerSignals.disputeThreat || data.value.buyerSignals.summary) && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-1 text-xs font-semibold text-muted">Buyer messages</div>
              {data.value.buyerSignals.summary && <p>{data.value.buyerSignals.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.value.buyerSignals.addressChangeRequested && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Asked to ship elsewhere{data.value.buyerSignals.requestedAddress ? `: ${data.value.buyerSignals.requestedAddress}` : ""}</span>}
                {data.value.buyerSignals.disputeThreat && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Mentions opening a case</span>}
                <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Urgency: {data.value.buyerSignals.urgency}</span>
              </div>
            </div>
          )}
          {data.value.suggestedReply && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
                Suggested reply to buyer
                <button
                  className="text-brand hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.value.suggestedReply);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap">{data.value.suggestedReply}</p>
            </div>
          )}
          <Source source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}

// ---------- Dispute evidence ----------

export function EvidenceDraft({ disputeId, canSubmit }: { disputeId: string; canSubmit: boolean }) {
  const router = useRouter();
  const { data, busy, err, load } = useAi<EvidencePack>(`/api/disputes/${disputeId}/evidence`);
  const [notes, setNotes] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (data) setNotes(data.value.narrative);
  }, [data]);

  async function queue() {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "provide_evidence", title: `Submit evidence on ${disputeId}`, summary: notes.slice(0, 160), payload: { disputeId, notes } }),
    });
    setQueued(res.ok ? "Queued. Approve it below or on the Approvals page." : "Could not queue.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">✦ Evidence pack</h3>
        <button onClick={() => load(true)} disabled={busy} className="text-xs text-brand hover:underline disabled:opacity-50">Regenerate</button>
      </div>
      {busy && !data && <Thinking label="Pulling tracking, delivery scan and messages into a response…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {data && (
        <>
          <p className="text-sm text-muted">{data.value.summary}</p>
          <label className="block text-xs font-semibold text-muted" htmlFor={`n-${disputeId}`}>Response to PayPal (edit before submitting)</label>
          <textarea id={`n-${disputeId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} className="w-full rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed outline-none focus:border-brand" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Attached evidence</div>
              <ul className="space-y-1 text-sm">
                {data.value.evidenceList.map((e, i) => (
                  <li key={i} className="flex gap-2"><span className="text-ok">✓</span><span><b className="font-medium">{e.item}</b> <span className="text-muted">· {e.whyItMatters}</span></span></li>
                ))}
              </ul>
            </div>
            {data.value.missingEvidence.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">Missing</div>
                <ul className="space-y-1 text-sm">
                  {data.value.missingEvidence.map((m, i) => <li key={i} className="flex gap-2"><span className="text-warn">!</span>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-canvas p-3 text-sm"><span className="text-xs font-semibold text-muted">Message to buyer: </span>{data.value.buyerMessage}</div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={queue} disabled={!canSubmit || !notes.trim()} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.primary}`}>Queue evidence for approval</button>
            {!canSubmit && <span className="text-xs text-muted">Evidence already submitted or case closed.</span>}
            {queued && <span className="text-xs text-ok">{queued}</span>}
            <Source source={data.source} note={data.note} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Health brief ----------

export function HealthBriefCard() {
  const { data, busy, err, load } = useAi<HealthBrief>("/api/health/brief");
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">✦ This week&apos;s brief</h2>
        <button onClick={() => load(true)} disabled={busy} className="text-xs text-brand hover:underline disabled:opacity-50">Refresh</button>
      </div>
      {busy && !data && <Thinking label="Reading your account signals…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {data && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{data.value.headline}</p>
          {data.value.paragraphs.map((p, i) => <p key={i} className="text-muted">{p}</p>)}
          <ol className="list-decimal space-y-1 pl-5">
            {data.value.actions.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
          <Source source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}

// ---------- Approvals ----------

const KIND_LABEL: Record<Approval["kind"], string> = {
  push_tracking: "Send tracking",
  provide_evidence: "Submit evidence",
  make_offer: "Partial offer",
  accept_claim: "Accept claim",
  refund: "Refund",
};

export function ApprovalCard({ a, compact = false }: { a: Approval; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(a.result ? { ok: a.status === "executed", message: a.result } : null);
  const [status, setStatus] = useState(a.status);

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    const r = await fetch(`/api/approvals/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const j = await r.json();
    setRes({ ok: j.ok, message: j.message });
    setStatus(j.approval?.status ?? (decision === "reject" ? "rejected" : j.ok ? "executed" : "failed"));
    setBusy(null);
    router.refresh();
  }

  const tone = status === "pending" ? "border-warn/40 bg-warn-soft/40" : status === "executed" ? "border-ok/30 bg-ok-soft/40" : status === "failed" ? "border-bad/30 bg-bad-soft/40" : "border-line bg-surface";
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
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
          <span className={`text-xs font-semibold uppercase ${status === "executed" ? "text-ok" : status === "failed" ? "text-bad" : "text-muted"}`}>{status}</span>
        )}
        {res && <span className={`text-xs ${res.ok ? "text-ok" : "text-bad"}`}>{res.message}</span>}
      </div>
    </div>
  );
}

// ---------- Agent ----------

const PRESETS = [
  "Release my held money",
  "Triage my open disputes and prepare responses",
  "What should I fix before shipping today?",
  "Give me a full account check-up and prepare every safe fix",
];

export function AgentConsole() {
  const [goal, setGoal] = useState(PRESETS[0]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(g = goal) {
    setBusy(true);
    setErr(null);
    setRun(null);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: g }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRun(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <label htmlFor="goal" className="text-xs font-semibold text-muted">What should the agent do?</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && go()} className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <button onClick={() => go()} disabled={busy} className={`rounded-md px-4 py-2 text-sm font-medium ${BTN.primary}`}>{busy ? "Working…" : "Run agent"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => { setGoal(p); void go(p); }} disabled={busy} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-brand hover:text-brand-ink disabled:opacity-50">{p}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">The agent can read your orders and disputes and <b>propose</b> actions. Anything that touches PayPal waits for your approval.</p>
      </div>

      {busy && <div className="rounded-xl border border-line bg-surface p-4"><Thinking label="Planning, reading orders and disputes, preparing proposals…" /></div>}
      {err && <p className="text-sm text-bad">{err}</p>}

      {run && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-line bg-surface p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Steps</h3>
              <Source source={run.source} note={run.note} />
            </div>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {run.steps.filter((s) => s.kind !== "final").map((s, i) => (
                <li key={i} className="text-sm">
                  <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${s.kind === "proposal" ? "bg-warn" : s.kind === "note" ? "bg-faint" : "bg-brand"}`} />
                  <div className="font-medium">{s.title}</div>
                  {s.detail && <div className="text-xs text-muted">{s.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-3 lg:col-span-3">
            <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4 text-sm">
              <h3 className="mb-1 text-sm font-semibold text-brand-ink">✦ Agent summary</h3>
              <p className="whitespace-pre-wrap">{run.answer}</p>
            </div>
            {run.approvals.length > 0 ? (
              <>
                <h3 className="text-sm font-semibold">Waiting for your approval ({run.approvals.length})</h3>
                {run.approvals.map((a) => <ApprovalCard key={a.id} a={a} />)}
              </>
            ) : (
              <p className="text-sm text-muted">No actions needed approval.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Limitation kit ----------

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
    await fetch("/api/kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ready }) });
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
  const [data, setData] = useState<Outcome<LimitationAnalysis> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/kit/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notice }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="notice" className="text-xs font-semibold text-muted">Paste the limitation email or notice</label>
        <button onClick={() => setNotice(SAMPLE_NOTICE)} className="text-xs text-brand hover:underline">Use a sample notice</button>
      </div>
      <textarea id="notice" value={notice} onChange={(e) => setNotice(e.target.value)} rows={6} placeholder="We've limited your account…" className="w-full rounded-lg border border-line p-3 text-sm outline-none focus:border-brand" />
      <button onClick={go} disabled={busy || !notice.trim()} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.primary}`}>{busy ? "Reading notice…" : "Work out what PayPal wants"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
      {data && (
        <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-soft/40 p-4 text-sm">
          {data.value.deadline && <p><b>Deadline:</b> {data.value.deadline}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-muted">Ready in your kit</div>
              <ul className="mt-1 space-y-0.5">{data.value.readyFromKit.map((x, i) => <li key={i} className="text-ok">✓ {x}</li>)}</ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">Still to gather</div>
              <ul className="mt-1 space-y-0.5">{data.value.missingFromKit.map((x, i) => <li key={i} className="text-warn">○ {x}</li>)}</ul>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Draft response</div>
            <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3">{data.value.draftResponse}</p>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Don&apos;t</div>
            <ul className="mt-1 list-disc pl-5">{data.value.cautions.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <Source source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}

// ---------- Live countdown ----------

export function Countdown({ due }: { due: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(due) - now;
  if (ms <= 0) return <span className="font-semibold text-bad">Overdue</span>;
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  const cls = h < 72 ? "text-bad" : h < 120 ? "text-warn" : "text-ink";
  return <span className={`font-semibold num ${cls}`}>{d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600_000) / 60_000)}m`} left</span>;
}
