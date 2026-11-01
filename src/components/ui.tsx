import type { ReactNode } from "react";
import type { Verdict } from "@/lib/rules/protection";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, aside }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand";
const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-canvas text-muted",
  brand: "bg-brand-soft text-brand-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}

export const VERDICT_TONE: Record<Verdict, Tone> = { protected: "ok", watch: "warn", at_risk: "bad", not_eligible: "neutral" };

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold num ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

/** Shows where a piece of text came from: Gemini, Gemini's saved answer, or the rules fallback. */
export function SourceTag({ source, note }: { source: "gemini" | "cache" | "rules"; note?: string }) {
  const label = source === "gemini" ? "Written by Gemini" : source === "cache" ? "Gemini · saved" : "Rule-based";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
      <span className={`h-1.5 w-1.5 rounded-full ${source === "rules" ? "bg-faint" : "bg-brand"}`} />
      {label}
      {note && <span className="text-warn">· {note}</span>}
    </span>
  );
}

/** "Label: detail" → just the detail, for places that already show the label. */
export function issueText(topIssue?: string) {
  return topIssue ? topIssue.split(": ").slice(1).join(": ") || topIssue : "";
}

export const money = (n: number, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export function relDays(iso: string, now = Date.now()) {
  const d = (Date.parse(iso) - now) / 86_400_000;
  const abs = Math.abs(d);
  const txt = abs < 1 ? `${Math.round(abs * 24)}h` : `${abs.toFixed(abs < 10 ? 1 : 0)}d`;
  return d >= 0 ? `in ${txt}` : `${txt} ago`;
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
