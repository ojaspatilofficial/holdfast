// Account-health heuristics built from the seller's own data. These mirror the signals PayPal says
// it reacts to (dispute rate, sudden volume changes, missing tracking); they are not PayPal's model.
import type { DB } from "../types";
import { checkOrder } from "./protection";

const DAY = 86_400_000;

export interface HealthFactor {
  id: string;
  label: string;
  value: string;
  level: "ok" | "warn" | "bad";
  detail: string;
}

export interface Health {
  score: number;
  disputeRatio: number; // INR + SNAD over 90 days
  disputeRatioThreshold: number;
  volumeSpike: number; // last 7d vs trailing weekly average
  untrackedShare: number;
  heldTotal: number;
  heldCount: number;
  atRiskCount: number;
  dueSoonCount: number;
  factors: HealthFactor[];
  weekly: { week: string; orders: number }[];
}

export function computeHealth(db: DB, now = Date.now()): Health {
  const in90 = db.orders.filter((o) => now - Date.parse(o.createdAt) <= 90 * DAY);
  const disputes90 = db.disputes.filter(
    (d) => now - Date.parse(d.createdAt) <= 90 * DAY && d.reason !== "UNAUTHORISED",
  );
  const disputeRatio = in90.length ? disputes90.length / in90.length : 0;

  const last7 = db.orders.filter((o) => now - Date.parse(o.createdAt) <= 7 * DAY).length;
  const prior = db.orders.filter((o) => {
    const age = now - Date.parse(o.createdAt);
    return age > 7 * DAY && age <= 63 * DAY;
  }).length;
  const avgWeek = prior / 8 || 1;
  const volumeSpike = last7 / avgWeek;

  const shipped30 = db.orders.filter((o) => o.shipment?.shippedAt && now - Date.parse(o.createdAt) <= 30 * DAY);
  const untracked = shipped30.filter((o) => !o.trackingPushedToPayPal);
  const untrackedShare = shipped30.length ? untracked.length / shipped30.length : 0;

  const held = db.orders.filter((o) => o.hold.status === "held");
  const heldTotal = held.reduce((s, o) => s + o.amount, 0);
  const atRiskCount = db.orders.filter((o) => now - Date.parse(o.createdAt) <= 30 * DAY && checkOrder(o, db.settings, now).verdict === "at_risk").length;
  const dueSoonDisputes = db.disputes.filter(
    (d) => d.status === "WAITING_FOR_SELLER_RESPONSE" && Date.parse(d.sellerResponseDue) - now < 72 * 3600_000,
  );
  const overdueCount = dueSoonDisputes.filter((d) => Date.parse(d.sellerResponseDue) < now).length;
  const dueSoonCount = dueSoonDisputes.length;

  const factors: HealthFactor[] = [
    {
      id: "ratio", label: "Dispute rate (90 days)", value: pct(disputeRatio),
      level: disputeRatio >= 0.015 ? "bad" : disputeRatio >= 0.01 ? "warn" : "ok",
      detail: `${disputes90.length} item-not-received / not-as-described cases on ${in90.length} orders. Above 1.5% PayPal moves sellers to a higher dispute-fee tier.`,
    },
    {
      id: "spike", label: "Sales volume vs normal", value: `${volumeSpike.toFixed(1)}×`,
      level: volumeSpike >= 2 ? "bad" : volumeSpike >= 1.5 ? "warn" : "ok",
      detail: `${last7} orders this week vs ~${avgWeek.toFixed(0)}/week before. PayPal lists a changed selling pattern as a hold trigger.`,
    },
    {
      id: "untracked", label: "Shipped without tracking on PayPal", value: pct(untrackedShare),
      level: untrackedShare > 0.1 ? "bad" : untrackedShare > 0.03 ? "warn" : "ok",
      detail: `${untracked.length} of ${shipped30.length} shipped orders in 30 days. PayPal releases held funds faster when tracking is on file.`,
    },
    {
      id: "held", label: "Funds on hold", value: `$${heldTotal.toFixed(0)}`,
      level: heldTotal > 1000 ? "bad" : heldTotal > 0 ? "warn" : "ok",
      detail: `${held.length} payments held.`,
    },
    {
      id: "deadlines", label: overdueCount > 0 ? "Disputes overdue / < 72h" : "Dispute deadlines < 72h", value: String(dueSoonCount),
      level: dueSoonCount > 0 ? "bad" : "ok",
      detail: overdueCount > 0 ? `${overdueCount} dispute(s) overdue! Unanswered disputes close in the buyer's favour.` : "Unanswered disputes close in the buyer's favour after the response window.",
    },
  ];

  let score = 100;
  for (const f of factors) score -= f.level === "bad" ? 14 : f.level === "warn" ? 6 : 0;
  score = Math.max(5, score);

  const weekly: Health["weekly"] = [];
  for (let w = 11; w >= 0; w--) {
    const start = now - (w + 1) * 7 * DAY;
    const end = now - w * 7 * DAY;
    weekly.push({
      week: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      orders: db.orders.filter((o) => {
        const t = Date.parse(o.createdAt);
        return t > start && t <= end;
      }).length,
    });
  }

  return { score, disputeRatio, disputeRatioThreshold: 0.015, volumeSpike, untrackedShare, heldTotal, heldCount: held.length, atRiskCount, dueSoonCount, factors, weekly };
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
