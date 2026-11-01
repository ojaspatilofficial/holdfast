import { Badge, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

const ACTOR: Record<string, "brand" | "info" | "warn" | "neutral"> = { seller: "brand", agent: "info", "paypal-webhook": "warn", system: "neutral" };

export default function ActivityPage() {
  const db = getDb();
  return (
    <>
      <PageHeader title="Activity & API log" subtitle="Everything Holdfast did, who did it, and the exact PayPal API request and response. Simulated calls are labelled." />
      <ol className="space-y-2">
        {db.audit.map((e) => (
          <li key={e.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={ACTOR[e.actor]}>{e.actor}</Badge>
              <span className="font-medium">{e.action}</span>
              <span className="ml-auto text-xs text-faint">{new Date(e.at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{e.detail}</p>
            {e.trace && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer select-none font-mono text-muted">
                  {e.trace.method} {e.trace.path.split("?")[0]} → {e.trace.status}{" "}
                  {e.trace.simulated ? <span className="text-warn">(simulated)</span> : <span className="text-ok">(PayPal sandbox)</span>}
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-[#0f1b2d] p-3 text-[11px] leading-relaxed text-[#d7e3f4]">{JSON.stringify(e.trace.body ?? null, null, 2)}</pre>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-[#0f1b2d] p-3 text-[11px] leading-relaxed text-[#d7e3f4]">{typeof e.trace.response === "string" ? e.trace.response : JSON.stringify(e.trace.response ?? null, null, 2)}</pre>
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
