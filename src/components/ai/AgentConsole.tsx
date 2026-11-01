"use client";

import { useState } from "react";
import type { AgentRun } from "@/lib/ai/agent";
import { messageOf, postJson } from "@/lib/http";
import { BTN } from "../ActionButton";
import { SourceTag } from "../ui";
import { ApprovalCard } from "./ApprovalCard";
import { Thinking } from "./shared";

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
      const r = await postJson<AgentRun>("/api/agent", { goal: g });
      if (!r.ok) throw new Error(messageOf(r.data, "Agent failed"));
      setRun(r.data);
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
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Steps</h3>
              <SourceTag source={run.source} />
            </div>
            {run.note && <p className="mb-3 text-xs text-warn">{run.note}</p>}
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
