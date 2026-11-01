"use client";

import { useEffect, useState } from "react";

/** Live deadline countdown. Renders after mount so server and client HTML match. */
export function Countdown({ due }: { due: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="font-semibold text-faint">…</span>;
  const ms = Date.parse(due) - now;
  if (ms <= 0) return <span className="font-semibold text-bad">Overdue</span>;
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  const cls = h < 72 ? "text-bad" : h < 120 ? "text-warn" : "text-ink";
  return <span className={`font-semibold num ${cls}`}>{d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600_000) / 60_000)}m`} left</span>;
}
