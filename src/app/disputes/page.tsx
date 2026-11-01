import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { Countdown } from "@/components/ai";
import { Badge, money, PageHeader, shortDate } from "@/components/ui";
import { paypalConfigured } from "@/lib/paypal/client";
import { REASON_LABEL, triageDispute } from "@/lib/rules/disputes";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function DisputesPage() {
  const db = getDb();
  const live = paypalConfigured();
  const rows = db.disputes
    .map((d) => ({ d, t: triageDispute(d, db.orders.find((o) => o.id === d.orderId)), o: db.orders.find((o) => o.id === d.orderId) }))
    .sort((a, b) => (a.d.status === "RESOLVED" ? 1 : 0) - (b.d.status === "RESOLVED" ? 1 : 0) || a.d.sellerResponseDue.localeCompare(b.d.sellerResponseDue));

  return (
    <>
      <PageHeader
        title="Dispute Radar"
        subtitle="Every open case with its deadline, whether Seller Protection covers it, and the cheapest way out. Unanswered cases close in the buyer's favour."
        actions={live ? <ActionButton endpoint="/api/paypal/sync">Sync from PayPal</ActionButton> : <ActionButton endpoint="/api/demo" body={{ action: "simulate_dispute" }}>Simulate new dispute</ActionButton>}
      />
      <div className="space-y-3">
        {rows.map(({ d, t, o }) => (
          <Link key={d.id} href={`/disputes/${d.id}`} className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{d.id}</span>
              <span className="font-medium">{REASON_LABEL[d.reason]}</span>
              <Badge tone={d.stage === "CHARGEBACK" ? "bad" : "neutral"}>{d.stage === "CHARGEBACK" ? "Chargeback" : "Inquiry"}</Badge>
              {d.status === "RESOLVED" ? (
                <Badge tone={d.outcome === "RESOLVED_SELLER_FAVOUR" ? "ok" : "neutral"}>{d.outcome?.replace(/_/g, " ").toLowerCase() ?? "resolved"}</Badge>
              ) : (
                <Badge tone={t.covered ? "ok" : "warn"}>{t.covered ? "Covered" : "Not covered"}</Badge>
              )}
              <span className="ml-auto text-sm num">{money(d.amount)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>{o?.buyer.name}</span>
              <span>Opened {shortDate(d.createdAt)}</span>
              {d.status === "WAITING_FOR_SELLER_RESPONSE" && <Countdown due={d.sellerResponseDue} />}
              {d.status === "UNDER_REVIEW" && <span className="text-info">Evidence submitted, under review</span>}
              {d.status === "WAITING_FOR_BUYER_RESPONSE" && <span className="text-info">Offer sent, waiting for buyer</span>}
              {d.status !== "RESOLVED" && <span>Recommended: <b className="text-ink">{t.recommended.label}</b></span>}
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No disputes. 🎉</p>}
      </div>
    </>
  );
}
