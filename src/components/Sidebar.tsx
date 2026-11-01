"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "◎" },
  { href: "/orders", label: "Protection Check", icon: "✓" },
  { href: "/holds", label: "Held money", icon: "◷" },
  { href: "/disputes", label: "Disputes", icon: "⚑", badge: "disputes" },
  { href: "/agent", label: "Agent", icon: "✦" },
  { href: "/approvals", label: "Approvals", icon: "☐", badge: "pending" },
  { href: "/kit", label: "Limitation kit", icon: "▤" },
  { href: "/activity", label: "Activity & API log", icon: "≡" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar(props: { business: string; mode: "demo" | "sandbox"; ai: string | null; pending: number; openDisputes: number }) {
  const path = usePathname();
  return (
    <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4 md:py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">H</div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">Holdfast</div>
          <div className="text-xs text-muted">{props.business}</div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const count = n.badge === "pending" ? props.pending : n.badge === "disputes" ? props.openDisputes : 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${active ? "bg-brand-soft font-medium text-brand-ink" : "text-muted hover:bg-canvas hover:text-ink"}`}
            >
              <span className="w-4 text-center text-xs opacity-70" aria-hidden>{n.icon}</span>
              <span className="whitespace-nowrap">{n.label}</span>
              {count > 0 && (
                <span className={`ml-auto rounded-full px-1.5 text-[11px] font-semibold num ${n.badge === "pending" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>{count}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="hidden space-y-2 px-5 pt-6 text-xs md:block">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${props.mode === "sandbox" ? "bg-ok" : "bg-warn"}`} />
          <span className="text-muted">PayPal: <b className="text-ink">{props.mode === "sandbox" ? "Sandbox (live API)" : "Demo (simulated)"}</b></span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${props.ai ? "bg-ok" : "bg-faint"}`} />
          <span className="text-muted">AI: <b className="text-ink">{props.ai ?? "Off (rules only)"}</b></span>
        </div>
      </div>
    </aside>
  );
}
