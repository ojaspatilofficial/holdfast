import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { Badge, Card, money, PageHeader, relDays } from "@/components/ui";
import { paypalConfigured } from "@/lib/paypal/client";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HoldsPage() {
  const db = getDb();
  const held = db.orders.filter((o) => o.hold.status === "held");
  const fixable = held.filter((o) => o.shipment?.trackingNumber && o.shipment.shippedAt && !o.trackingPushedToPayPal);
  const notShipped = held.filter((o) => !o.shipment?.shippedAt);
  const waiting = held.filter((o) => o.trackingPushedToPayPal);
  const otherUntracked = db.orders.filter((o) => o.hold.status !== "held" && o.shipment?.shippedAt && o.shipment.trackingNumber && !o.trackingPushedToPayPal);
  const released = db.orders.filter((o) => o.hold.status === "released");
  const batch = [...fixable, ...otherUntracked];
  const live = paypalConfigured();

  return (
    <>
      <PageHeader
        title="Held money"
        subtitle={<>PayPal&apos;s own docs say the fastest way to release held payments is to add tracking: money comes back once delivery is confirmed. Holdfast finds the payments missing tracking and sends it in one batch, after you approve.{!live && <> <Badge tone="warn">Holds are simulated in demo mode</Badge></>}</>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs text-muted">On hold</div><div className="text-2xl font-semibold text-warn num">{money(held.reduce((s, o) => s + o.amount, 0))}</div><div className="text-xs text-faint">{held.length} payments</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs text-muted">Fixable now</div><div className="text-2xl font-semibold num">{money(fixable.reduce((s, o) => s + o.amount, 0))}</div><div className="text-xs text-faint">shipped, tracking not on PayPal</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs text-muted">Waiting for delivery scan</div><div className="text-2xl font-semibold num">{money(waiting.reduce((s, o) => s + o.amount, 0))}</div><div className="text-xs text-faint">{waiting.length} payments</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs text-muted">Released</div><div className="text-2xl font-semibold text-ok num">{money(released.reduce((s, o) => s + o.amount, 0))}</div><div className="text-xs text-faint">{released.length} payments</div></div>
      </div>

      <Card
        className="mt-4"
        title={`Tracking batch: ${batch.length} order(s)`}
        aside={batch.length > 0 && (
          <ActionButton
            endpoint="/api/approvals"
            variant="primary"
            body={{ kind: "push_tracking", title: `Send tracking for ${batch.length} order(s)`, summary: `Batch upload to PayPal trackers API. ${money(fixable.reduce((s, o) => s + o.amount, 0))} currently on hold.`, payload: { orderIds: batch.map((o) => o.id) } }}
          >
            Prepare batch for approval
          </ActionButton>
        )}
      >
        {batch.length === 0 ? (
          <p className="text-sm text-muted">Every shipped order already has tracking on PayPal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2 font-medium">Buyer</th><th className="font-medium">Amount</th><th className="font-medium">Carrier · tracking</th><th className="font-medium">Last scan</th><th className="font-medium">Funds</th></tr></thead>
              <tbody className="divide-y divide-line">
                {batch.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2"><Link href={`/orders/${o.id}`} className="hover:underline">{o.buyer.name}</Link></td>
                    <td className="num">{money(o.amount)}</td>
                    <td><span className="font-medium">{o.shipment!.carrier}</span> <span className="font-mono text-xs text-muted">{o.shipment!.trackingNumber}</span></td>
                    <td className="text-muted">{o.shipment!.lastScan}</td>
                    <td>{o.hold.status === "held" ? <Badge tone="warn">On hold</Badge> : <Badge>Available</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">Uses <span className="font-mono">POST /v1/shipping/trackers-batch</span> (up to 20 per call). Approve it on the Approvals page or from the agent.</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Waiting for delivery">
          {waiting.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="divide-y divide-line text-sm">
              {waiting.map((o) => (
                <li key={o.id} className="flex justify-between py-2"><Link href={`/orders/${o.id}`} className="hover:underline">{o.buyer.name} · {money(o.amount)}</Link><span className="text-muted">{o.hold.releaseEta ? `expected ${relDays(o.hold.releaseEta)}` : o.hold.reason}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Held but not shipped yet">
          {notShipped.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <ul className="divide-y divide-line text-sm">
              {notShipped.map((o) => <li key={o.id} className="flex justify-between py-2"><Link href={`/orders/${o.id}`} className="hover:underline">{o.buyer.name} · {money(o.amount)}</Link><span className="text-muted">Ship, then send tracking</span></li>)}
            </ul>
          )}
          {held.filter((o) => o.shipment?.shippedAt && !o.trackingPushedToPayPal && !o.shipment.trackingNumber).length > 0 && <p className="mt-2 text-xs text-warn">Some shipped orders have no tracking number at all.</p>}
        </Card>
      </div>
    </>
  );
}
