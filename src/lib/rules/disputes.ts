// Deterministic dispute triage: coverage, deadline and an expected-cost comparison of the options.
import type { Dispute, Order } from "../types";
import { normAddr } from "./protection";

export const REASON_LABEL: Record<Dispute["reason"], string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized payment",
};

export interface EvidenceItem {
  id: string;
  label: string;
  available: boolean;
  source: string;
}

export interface OptionCost {
  action: "fight" | "partial_offer" | "accept_claim";
  label: string;
  expectedCost: number;
  note: string;
  offerAmount?: number;
}

export interface DisputeTriage {
  covered: boolean;
  coverageReason: string;
  winProbability: number;
  hoursLeft: number;
  urgency: "overdue" | "critical" | "soon" | "ok" | "closed";
  evidence: EvidenceItem[];
  options: OptionCost[];
  recommended: OptionCost;
}

const DISPUTE_FEE = 15; // US standard tier per PayPal fee page; $30 in the high-volume tier

export function triageDispute(d: Dispute, order: Order | undefined, now = Date.now()): DisputeTriage {
  const s = order?.shipment;
  const physical = order ? order.items.every((i) => i.kind === "physical") : false;
  const delivered = Boolean(s?.deliveredAt);
  const addressMatch = s && order ? normAddr(s.labelAddress) === normAddr(order.shipTo) : false;
  const tracked = Boolean(order?.trackingPushedToPayPal && s?.trackingNumber);
  const signed = Boolean(s?.signatureRequired) || /signed by/i.test(s?.lastScan ?? "");

  let covered = false;
  let coverageReason = "";
  let p = 0.3;

  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") {
    covered = physical && delivered && addressMatch && tracked;
    coverageReason = covered
      ? "Covered: physical item, tracking on PayPal, delivered to the transaction address."
      : !delivered
        ? "Not yet covered: no “delivered” scan. Seller Protection for item-not-received needs proof of delivery."
        : !addressMatch
          ? "Not covered: shipped to an address other than the one on the PayPal transaction."
          : "Not covered: tracking isn't on the PayPal transaction.";
    p = covered ? (signed ? 0.92 : 0.82) : delivered ? 0.45 : 0.22;
  } else if (d.reason === "UNAUTHORISED") {
    covered = physical && delivered && addressMatch;
    coverageReason = covered
      ? "Covered: delivered to the transaction address; Seller Protection covers unauthorized-payment claims."
      : "Not covered: needs proof of shipment to the transaction address.";
    p = covered ? (signed ? 0.9 : 0.78) : 0.25;
  } else {
    covered = false;
    coverageReason = "Not covered: Seller Protection excludes “not as described” claims. Outcome depends on your listing evidence.";
    p = 0.35;
  }

  const hoursLeft = (Date.parse(d.sellerResponseDue) - now) / 3600_000;
  const urgency: DisputeTriage["urgency"] =
    d.status === "RESOLVED" || d.status === "UNDER_REVIEW" ? "closed" : hoursLeft < 0 ? "overdue" : hoursLeft < 72 ? "critical" : hoursLeft < 120 ? "soon" : "ok";

  const evidence: EvidenceItem[] = [
    { id: "tracking", label: "Tracking number on PayPal", available: tracked, source: s ? `${s.carrier} ${s.trackingNumber}` : "none" },
    { id: "delivery", label: "Delivery scan to transaction address", available: delivered && addressMatch, source: s?.lastScan ?? "none" },
    { id: "order", label: "Order record (items, amount, date)", available: Boolean(order), source: order ? `Order ${order.id}` : "missing" },
    { id: "messages", label: "Buyer conversation", available: Boolean(order?.buyerMessages.length), source: `${order?.buyerMessages.length ?? 0} messages` },
    { id: "signature", label: "Signature / handed-to-resident scan", available: signed, source: signed ? s?.lastScan ?? "signature on label" : "none" },
  ];
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") {
    evidence.push({ id: "listing", label: "Listing description and photos", available: false, source: "Upload from your shop" });
  }

  const amount = d.amount;
  const offerAmount = Math.round(amount * 0.25);
  const options: OptionCost[] = [
    { action: "fight", label: "Fight with evidence", expectedCost: round((1 - p) * amount + DISPUTE_FEE), note: `${Math.round(p * 100)}% estimated win chance. Fee kept either way.` },
    { action: "partial_offer", label: `Offer partial refund ($${offerAmount})`, expectedCost: round(offerAmount * 0.6 + (1 - 0.6) * ((1 - p) * amount) + DISPUTE_FEE), note: "Buyer keeps item; ~60% of buyers accept a fair partial offer (assumption).", offerAmount },
    { action: "accept_claim", label: "Accept claim and refund", expectedCost: round(amount + DISPUTE_FEE + (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" ? -amount * 0.7 : 0)), note: d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" ? "Buyer returns item; you resell it at ~70% value." : "Full refund, ends the case." },
  ];
  const recommended = [...options].sort((a, b) => a.expectedCost - b.expectedCost)[0];
  return { covered, coverageReason, winProbability: p, hoursLeft, urgency, evidence, options, recommended };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
