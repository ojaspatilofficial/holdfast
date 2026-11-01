import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { HealthBriefCard } from "@/components/ai";
import { DeadlineTimeline, HealthGauge, WeeklyBars, type TimelineEvent } from "@/components/charts";
import { Badge, Card, issueText, money, PageHeader, Stat } from "@/components/ui";
import { paypalConfigured } from "@/lib/paypal/client";
import { REASON_LABEL } from "@/lib/rules/disputes";
import { computeHealth } from "@/lib/rules/health";
import { checkOrder } from "@/lib/rules/protection";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Overview() {
  const db = getDb();
  const now = Date.now();
  const h = computeHealth(db, now);
  const live = paypalConfigured();

  const untracked = db.orders.filter((o) => o.shipment?.shippedAt && !o.trackingPushedToPayPal);
  const untrackedHeld = untracked.filter((o) => o.hold.status === "held");
  const recent = db.orders.filter((o) => now - Date.parse(o.createdAt) < 30 * 86_400_000);
  const atRisk = recent.map((o) => ({ o, r: checkOrder(o, db.settings, now) })).filter((x) => x.r.verdict === "at_risk" && !x.o.shipment?.shippedAt);
  const open = db.disputes.filter((d) => d.status === "WAITING_FOR_SELLER_RESPONSE").sort((a, b) => a.sellerResponseDue.localeCompare(b.sellerResponseDue));
  const pending = db.approvals.filter((a) => a.status === "pending");

  const events: TimelineEvent[] = [
    ...open.map((d) => ({ at: d.sellerResponseDue, label: `${d.id.slice(-5)} due`, kind: "deadline" as const })),
    ...db.orders.filter((o) => o.hold.status === "held" && o.hold.releaseEta).map((o) => ({ at: o.hold.releaseEta!, label: money(o.amount), kind: "release" as const })),
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={<>Where your PayPal money is stuck, what could get it stuck next, and what to do about it today.{!live && <> <Badge tone="warn">Demo data</Badge></>}</>}
        actions={
          <>
            <Link href="/agent" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-ink">✦ Ask the agent</Link>
            {!live && <ActionButton endpoint="/api/demo" body={{ action: "simulate_dispute" }}>Simulate new dispute</ActionButton>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money on hold" value={money(h.heldTotal)} hint={`${h.heldCount} payments · ${untrackedHeld.length} fixable now`} tone={h.heldTotal > 0 ? "warn" : "ok"} />
        <Stat label="Orders at risk (not shipped)" value={atRisk.length} hint="Would lose Seller Protection as is" tone={atRisk.length ? "bad" : "ok"} />
        <Stat label="Disputes due < 72h" value={h.dueSoonCount} hint={`${open.length} awaiting your response`} tone={h.dueSoonCount ? "bad" : "ok"} />
        <Stat label="Dispute rate (90d)" value={`${(h.disputeRatio * 100).toFixed(2)}%`} hint="Higher fee tier at 1.5%" tone={h.disputeRatio >= 0.015 ? "bad" : h.disputeRatio >= 0.01 ? "warn" : "ok"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Next best actions" className="lg:col-span-3" aside={pending.length > 0 && <Link href="/approvals" className="text-xs font-medium text-warn">{pending.length} waiting for approval →</Link>}>
          <ol className="space-y-3">
            {untracked.length > 0 && (
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warn-soft text-xs font-semibold text-warn">1</span>
                <div className="flex-1 text-sm">
                  <div className="font-medium">Send tracking for {untracked.length} shipped order(s)</div>
                  <div className="text-muted">PayPal doesn&apos;t have their tracking. {untrackedHeld.length > 0 && <>That&apos;s why <b>{money(untrackedHeld.reduce((s, o) => s + o.amount, 0))}</b> is on hold.</>}</div>
                </div>
                <Link href="/holds" className="shrink-0 text-sm font-medium text-brand hover:underline">Release →</Link>
              </li>
            )}
            {atRisk.length > 0 && (
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bad-soft text-xs font-semibold text-bad">2</span>
                <div className="flex-1 text-sm">
                  <div className="font-medium">Fix {atRisk.length} order(s) before they ship</div>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {atRisk.slice(0, 3).map(({ o, r }) => (
                      <li key={o.id}><Link href={`/orders/${o.id}`} className="hover:text-ink hover:underline">{o.buyer.name} · {money(o.amount)}</Link>: {issueText(r.topIssue)}</li>
                    ))}
                  </ul>
                </div>
                <Link href="/orders" className="shrink-0 text-sm font-medium text-brand hover:underline">Review →</Link>
              </li>
            )}
            {open.length > 0 && (
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-info-soft text-xs font-semibold text-info">3</span>
                <div className="flex-1 text-sm">
                  <div className="font-medium">Answer {open.length} dispute(s)</div>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {open.slice(0, 3).map((d) => (
                      <li key={d.id}><Link href={`/disputes/${d.id}`} className="hover:text-ink hover:underline">{d.id}</Link> · {REASON_LABEL[d.reason]} · {money(d.amount)}</li>
                    ))}
                  </ul>
                </div>
                <Link href="/disputes" className="shrink-0 text-sm font-medium text-brand hover:underline">Respond →</Link>
              </li>
            )}
            {!untracked.length && !atRisk.length && !open.length && <li className="text-sm text-muted">Nothing urgent. Nice work.</li>}
          </ol>
        </Card>
        <div className="lg:col-span-2"><HealthBriefCard /></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Account health" className="lg:col-span-3" aside={<span className="text-[11px] text-faint">Holdfast heuristics, not PayPal&apos;s model</span>}>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center sm:w-48"><HealthGauge score={h.score} /></div>
            <ul className="flex-1 divide-y divide-line">
              {h.factors.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.level === "bad" ? "bg-bad" : f.level === "warn" ? "bg-warn" : "bg-ok"}`} />
                  <div className="flex-1 text-sm">
                    <div className="flex justify-between gap-2"><span className="font-medium">{f.label}</span><span className="num font-semibold">{f.value}</span></div>
                    <div className="text-xs text-muted">{f.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title="Orders per week" className="lg:col-span-2" aside={h.volumeSpike >= 1.5 && <Badge tone="warn">{h.volumeSpike.toFixed(1)}× spike</Badge>}>
          <WeeklyBars data={h.weekly} />
          <p className="mt-2 text-xs text-muted">Sudden jumps in sales are one of the patterns PayPal lists as a reason to hold payments. Keep tracking flowing during spikes.</p>
        </Card>
      </div>

      <Card title="Next 3 weeks" className="mt-4">
        <DeadlineTimeline events={events} />
      </Card>
    </>
  );
}
