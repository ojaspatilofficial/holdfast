"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "danger";

export const BTN: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-ink disabled:opacity-60",
  secondary: "border border-line bg-surface text-ink hover:bg-canvas disabled:opacity-60",
  ghost: "text-brand hover:bg-brand-soft disabled:opacity-60",
  danger: "border border-bad/30 bg-surface text-bad hover:bg-bad-soft disabled:opacity-60",
};

export function ActionButton({
  endpoint,
  body,
  children,
  variant = "secondary",
  confirm,
  onDone,
  className = "",
  showMessage = true,
}: {
  endpoint: string;
  body?: unknown;
  children: ReactNode;
  variant?: Variant;
  confirm?: string;
  onDone?: (data: unknown) => void;
  className?: string;
  showMessage?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      const text = (data as { message?: string; error?: string }).message ?? (data as { error?: string }).error ?? (res.ok ? "Done." : "Something went wrong.");
      setMsg({ ok: res.ok && (data as { ok?: boolean }).ok !== false, text });
      onDone?.(data);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button onClick={run} disabled={busy} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${BTN[variant]} ${className}`}>
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {children}
      </button>
      {showMessage && msg && <span className={`max-w-xs text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
    </span>
  );
}
