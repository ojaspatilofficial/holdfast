import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { ApprovalCard, Countdown, EvidenceDraft } from "@/components/ai";
import { Badge, Card, money, PageHeader, shortDate } from "@/components/ui";
import { paypalConfigured } from "@/lib/paypal/client";
import { REASON_LABEL, triageDispute } from "@/lib/rules/disputes";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const d = db.disputes.find((x) => x.id === id);
  if (!d) notFound();
  const o = db.orders.find((x) => x.id === d.orderId);
  const t = triageDispute(d, o);
  const approvals = db.approvals.filter((a) => (a.payload as { disputeId?: string }).disputeId === d.id);
  const open = d.status !== "RESOLVED";
  const canRespond = d.status === "WAITING_FOR_SELLER_RESPONSE" || d.status === "OPEN";
  const live = paypalConfigured();

  return (
    <>
      <Link href="/disputes" className="text-sm text-muted hover:text-ink">← All disputes</Link>
      <PageHeader
        title={`${REASON_LABEL[d.reason]} · ${money(d.amount)}`}
        subtitle={<><span className="font-mono text-xs">{d.id}</span> · {o?.buyer.name} · opened {shortDate(d.createdAt)} · “{d.buyerClaim}”</>}
        actions={
          <>
            {canRespond && <span className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm"><Countdown due={d.sellerResponseDue} /></span>}
            <Badge tone={d.status === "RESOLVED" ? (d.outcome === "RESOLVED_SELLER_FAVOUR" ? "ok" : "neutral") : "info"}>{d.status.replace(/_/g, " ").toLowerCase()}</Badge>
          </>
        }
      />

      {d.status === "RESOLVED" && (
        <div className={`mb-4 rounded-xl border p-4 text-sm ${d.outcome === "RESOLVED_SELLER_FAVOUR" ? "border-ok/30 bg-ok-soft text-ok" : "border-line bg-canvas text-muted"}`}>
          {d.outcome === "RESOLVED_SELLER_FAVOUR" ? `Won. PayPal closed this case in your favour; ${money(d.amount)} stays with you.` : `Closed: ${d.outcome?.replace(/_/g, " ").toLowerCase()}.`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Coverage">
            <div className="flex items-center gap-2">
              <Badge tone={t.covered ? "ok" : "warn"}>{t.covered ? "Covered by Seller Protection" : "Not covered"}</Badge>
              <span className="text-xs text-muted">{Math.round(t.winProbability * 100)}% est. win chance</span>
            </div>
            <p className="mt-2 text-sm text-muted">{t.coverageReason}</p>
          </Card>

          <Card title="Your options (expected cost)">
            <ul className="space-y-2">
              {t.options.map((op) => (
                <li key={op.action} className={`rounded-lg border p-3 text-sm ${op.action === t.recommended.action ? "border-brand bg-brand-soft/50" : "border-line"}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{op.label}{op.action === t.recommended.action && <span className="ml-2 text-xs text-brand">Recommended</span>}</span>
                    <span className="num font-semibold">{money(op.expectedCost)}</span>
                  </div>
                  <div className="text-xs text-muted">{op.note}</div>
                  {open && canRespond && op.action === "partial_offer" && (
                    <div className="mt-2">
                      <ActionButton endpoint="/api/approvals" body={{ kind: "make_offer", title: `Offer ${money(op.offerAmount ?? 0)} on ${d.id}`, summary: "Partial refund, buyer keeps the item.", payload: { disputeId: d.id, amount: op.offerAmount, note: "We're sorry this wasn't what you expected. We'd like to offer a partial refund so you can keep the item." } }}>Queue offer</ActionButton>
                    </div>
                  )}
                  {open && canRespond && op.action === "accept_claim" && (
                    <div className="mt-2">
                      <ActionButton endpoint="/api/approvals" variant="danger" body={{ kind: "accept_claim", title: `Accept claim on ${d.id}`, summary: `Refund ${money(d.amount)} and close the case.`, payload: { disputeId: d.id, note: "Accepting the claim." } }}>Queue accept</ActionButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Estimates from Holdfast rules ($15 dispute fee, kept either way). Not legal or financial advice.</p>
          </Card>

          <Card title="Evidence on file">
            <ul className="space-y-1.5 text-sm">
              {t.evidence.map((e) => (
                <li key={e.id} className="flex gap-2"><span className={e.available ? "text-ok" : "text-faint"}>{e.available ? "✓" : "○"}</span><span><span className={e.available ? "" : "text-muted"}>{e.label}</span> <span className="text-xs text-faint">{e.source}</span></span></li>
              ))}
            </ul>
            {o && <Link href={`/orders/${o.id}`} className="mt-2 inline-block text-xs text-brand hover:underline">Open order →</Link>}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-3">
          <Card><EvidenceDraft disputeId={d.id} canSubmit={canRespond} /></Card>
          {approvals.length > 0 && (
            <Card title="Actions on this case">
              <div className="space-y-2">{approvals.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
            </Card>
          )}
          {d.status === "UNDER_REVIEW" && (
            <Card title={live ? "Sandbox: finish this test case" : "Demo: finish this case"}>
              <p className="mb-3 text-sm text-muted">In the sandbox, PayPal lets you force the outcome of a test dispute that&apos;s under review{live ? "" : " (simulated here)"}.</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton endpoint={`/api/disputes/${d.id}/settle`} body={{ outcome: "SELLER_FAVOR" }} variant="primary">Resolve in seller&apos;s favour</ActionButton>
                <ActionButton endpoint={`/api/disputes/${d.id}/settle`} body={{ outcome: "BUYER_FAVOR" }}>Resolve in buyer&apos;s favour</ActionButton>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
