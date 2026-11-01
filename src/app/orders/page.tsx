import { OrdersGrid, type OrderRow } from "@/components/OrdersGrid";
import { PageHeader } from "@/components/ui";
import { checkOrder } from "@/lib/rules/protection";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  const db = getDb();
  const now = Date.now();
  const rows: OrderRow[] = db.orders.map((o) => {
    const r = checkOrder(o, db.settings, now);
    const s = o.shipment;
    return {
      id: o.id,
      created: o.createdAt,
      buyer: o.buyer.name,
      channel: o.channel,
      amount: o.amount,
      country: o.shipTo.country,
      shipping: s?.deliveredAt ? "Delivered" : s?.shippedAt ? "In transit" : s?.labelAddress ? "Label drafted" : "Not shipped",
      verdict: r.verdict,
      score: r.score,
      topIssue: r.topIssue ?? "All checks passed",
      hold: o.hold.status,
    };
  });
  return (
    <>
      <PageHeader
        title="Protection Check"
        subtitle="Every order checked against PayPal Seller Protection rules before it ships. Click an order to see why and how to fix it."
      />
      <OrdersGrid rows={rows} />
    </>
  );
}
