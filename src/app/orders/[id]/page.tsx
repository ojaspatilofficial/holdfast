import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { OrderAi } from "@/components/ai";
import { Badge, Card, money, PageHeader, VERDICT_TONE } from "@/components/ui";
import { REASON_LABEL } from "@/lib/rules/disputes";
import { checkOrder, VERDICT_LABEL, type Check } from "@/lib/rules/protection";
import { getDb } from "@/lib/store";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";

const ICON: Record<Check["state"], { i: string; cls: string }> = {
  pass: { i: "✓", cls: "bg-ok-soft text-ok" },
  fail: { i: "✕", cls: "bg-bad-soft text-bad" },
  warn: { i: "!", cls: "bg-warn-soft text-warn" },
  pending: { i: "…", cls: "bg-canvas text-muted" },
  na: { i: "–", cls: "bg-canvas text-faint" },
};

const FIX_LABEL: Record<string, string> = {
  fix_address: "Reprint label to PayPal address",
  require_signature: "Add signature confirmation",
  ship_now: "Mark shipped now",
  use_tracked_carrier: "Switch to tracked service",
};

function Addr({ a }: { a: Address }) {
  return <span>{a.name && <>{a.name}, </>}{a.line1}, {a.city} {a.state} {a.postalCode}, {a.country}</span>;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const o = db.orders.find((x) => x.id === id);
  if (!o) notFound();
  const r = checkOrder(o, db.settings);
  const disputes = db.disputes.filter((d) => d.orderId === o.id);
  const s = o.shipment;

  return (
    <>
      <Link href="/orders" className="text-sm text-muted hover:text-ink">← All orders</Link>
      <PageHeader
        title={`${o.buyer.name} · ${money(o.amount)}`}
        subtitle={<>Order <span className="font-mono text-xs">{o.id}</span> · capture <span className="font-mono text-xs">{o.captureId}</span> · paid {new Date(o.createdAt).toLocaleString()} via {o.channel}</>}
        actions={<><Badge tone={VERDICT_TONE[r.verdict]}>{VERDICT_LABEL[r.verdict]}</Badge><Badge>Score {r.score}</Badge></>}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card title="Seller Protection checks">
            <ul className="divide-y divide-line">
              {r.checks.map((c) => (
                <li key={c.id} className="flex gap-3 py-3">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${ICON[c.state].cls}`}>{ICON[c.state].i}</span>
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-muted">{c.detail}</div>
                    {c.fix && (c.state === "fail" || c.state === "warn") && <div className="mt-1 text-xs text-ink"><b>Fix:</b> {c.fix}</div>}
                    {c.fixAction && (c.state === "fail" || c.state === "warn") && (
                      <div className="mt-2">
                        {c.fixAction === "push_tracking" ? (
                          <ActionButton
                            endpoint="/api/approvals"
                            variant="primary"
                            body={{ kind: "push_tracking", title: `Send tracking for ${o.buyer.name}`, summary: `${s?.carrier} ${s?.trackingNumber} → PayPal (${money(o.amount)})`, payload: { orderIds: [o.id] } }}
                          >
                            Queue tracking upload
                          </ActionButton>
                        ) : (
                          <ActionButton endpoint={`/api/orders/${o.id}/fix`} body={{ action: c.fixAction }}>{FIX_LABEL[c.fixAction]}</ActionButton>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Verdicts come from fixed rules based on PayPal&apos;s US Seller Protection policy. The AI only explains them.</p>
          </Card>

          <Card title="Order details">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Items</dt><dd>{o.items.map((i) => <div key={i.name}>{i.quantity}× {i.name} <span className="text-muted">({i.kind}, {money(i.unitAmount)})</span></div>)}</dd></div>
              <div><dt className="text-xs text-muted">Address on PayPal transaction</dt><dd><Addr a={o.shipTo} /></dd></div>
              <div><dt className="text-xs text-muted">Label address</dt><dd>{s?.labelAddress ? <Addr a={s.labelAddress} /> : <span className="text-muted">No label yet</span>}</dd></div>
              <div><dt className="text-xs text-muted">Shipment</dt><dd>{s?.shippedAt ? <>{s.carrier} <span className="font-mono text-xs">{s.trackingNumber}</span>{s.signatureRequired && " · signature"}<div className="text-muted">“{s.lastScan}”</div></> : <span className="text-muted">Not shipped</span>}</dd></div>
              <div><dt className="text-xs text-muted">Funds</dt><dd>{o.hold.status === "held" ? <span className="text-warn">On hold · {o.hold.reason}</span> : o.hold.status === "released" ? <span className="text-ok">Released · {o.hold.reason}</span> : "Available"}</dd></div>
              <div><dt className="text-xs text-muted">Disputes</dt><dd>{disputes.length ? disputes.map((d) => <Link key={d.id} href={`/disputes/${d.id}`} className="block text-brand hover:underline">{d.id} · {REASON_LABEL[d.reason]}</Link>) : "None"}</dd></div>
            </dl>
          </Card>

          {o.buyerMessages.length > 0 && (
            <Card title="Buyer messages">
              <ul className="space-y-2">
                {o.buyerMessages.map((m, i) => (
                  <li key={i} className="rounded-lg bg-canvas p-3 text-sm"><div className="text-[11px] text-faint">{new Date(m.at).toLocaleString()}</div>{m.text}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6"><OrderAi orderId={o.id} /></div>
        </div>
      </div>
    </>
  );
}
