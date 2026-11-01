"use client";

import type { HealthBrief } from "@/lib/ai/features";
import { SourceTag } from "../ui";
import { RegenButton, Thinking, useAi } from "./shared";

export function HealthBriefCard() {
  const { data, busy, err, load } = useAi<HealthBrief>("/api/health/brief");
  const v = data?.value;
  return (
    <div className="h-full rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">✦ This week&apos;s brief</h2>
        <RegenButton onClick={() => load(true)} busy={busy} label="Refresh" />
      </div>
      {busy && !data && <Thinking label="Reading your account signals…" />}
      {err && <p className="text-sm text-bad">{err}</p>}
      {v && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{v.headline}</p>
          {v.paragraphs.map((p, i) => <p key={i} className="text-muted">{p}</p>)}
          <ol className="list-decimal space-y-1 pl-5">
            {v.actions.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
          <SourceTag source={data.source} note={data.note} />
        </div>
      )}
    </div>
  );
}
