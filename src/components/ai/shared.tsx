"use client";

import { useCallback, useEffect, useState } from "react";
import { messageOf, postJson } from "@/lib/http";

export type AiSource = "gemini" | "cache" | "rules";
export interface AiResult<T> {
  value: T;
  source: AiSource;
  note?: string;
}

/** POSTs to an AI endpoint (optionally on mount). `load(true)` forces a fresh Gemini answer. */
export function useAi<T>(endpoint: string, auto = true) {
  const [data, setData] = useState<AiResult<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(
    async (force = false) => {
      setBusy(true);
      setErr(null);
      try {
        const r = await postJson<AiResult<T>>(endpoint, { force });
        if (!r.ok) throw new Error(messageOf(r.data, "Request failed"));
        setData(r.data);
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

/** Loading state that shows elapsed time, since free-tier Gemini can take a while. */
export function Thinking({ label = "Thinking…" }: { label?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-2 py-1" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" /> {label}
        {secs >= 5 && <span className="text-faint num">{secs}s{secs >= 15 ? " · free-tier Gemini can take up to a minute" : ""}</span>}
      </div>
      <div className="h-3 w-3/4 animate-pulse rounded bg-canvas" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-canvas" />
    </div>
  );
}

export function RegenButton({ onClick, busy, label = "Regenerate" }: { onClick: () => void; busy: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={busy} className="text-xs text-brand hover:underline disabled:opacity-50">
      {busy ? "Working…" : label}
    </button>
  );
}
