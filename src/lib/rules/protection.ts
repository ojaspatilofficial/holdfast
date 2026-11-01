// Deterministic Seller Protection pre-ship check. The AI explains these verdicts; it never decides them.
// Rules follow PayPal US Seller Protection: tangible goods, shipped to the address on Transaction
// Details, with proof of delivery (and signature confirmation for high-value orders, threshold set by seller).
import type { Address, Order, Settings } from "../types";

export type CheckState = "pass" | "fail" | "warn" | "pending" | "na";
export type FixAction = "push_tracking" | "require_signature" | "fix_address" | "ship_now" | "use_tracked_carrier";

export interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  fix?: string;
  fixAction?: FixAction;
}

export type Verdict = "protected" | "watch" | "at_risk" | "not_eligible";

export interface ProtectionResult {
  verdict: Verdict;
  score: number;
  checks: Check[];
  topIssue?: string;
}

const DAY = 86_400_000;

export function normAddr(a: Address) {
  return [a.line1, a.postalCode, a.country]
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .join("|");
}

export const ADDRESS_CHANGE_RE = /(ship|send|deliver)\w*\s+(it\s+)?(to|at)\b.*(instead|different|cousin|friend|new address|other address)|different address|change (the|my) address|new address/i;
export const DISPUTE_THREAT_RE = /(open|file|start)\w*\s+(a\s+)?(case|claim|dispute)|chargeback|report (you|this)|paypal claim/i;

export function signalsFromMessages(order: Order) {
  const text = order.buyerMessages.map((m) => m.text).join("\n");
  return {
    addressChangeRequested: ADDRESS_CHANGE_RE.test(text),
    disputeThreat: DISPUTE_THREAT_RE.test(text),
  };
}

export function checkOrder(order: Order, settings: Settings, now = Date.now()): ProtectionResult {
  const checks: Check[] = [];
  const s = order.shipment;
  const shipped = Boolean(s?.shippedAt);
  const intl = order.shipTo.country !== "US";
  const sig = signalsFromMessages(order);

  // 1. Tangible goods only.
  const intangible = order.items.filter((i) => i.kind !== "physical");
  checks.push(
    intangible.length
      ? { id: "tangible", label: "Physical goods", state: "fail", detail: `${intangible.map((i) => i.name).join(", ")} is ${intangible[0].kind}. Seller Protection only covers tangible items that ship.`, fix: "Keep delivery proof yourself: download logs, IP and timestamp, plus written acceptance of your terms." }
      : { id: "tangible", label: "Physical goods", state: "pass", detail: "All items are tangible and shippable." },
  );

  // 2. Ship to the address on Transaction Details.
  if (!s) {
    checks.push({ id: "address", label: "Ships to PayPal address", state: sig.addressChangeRequested ? "warn" : "pending", detail: sig.addressChangeRequested ? "Buyer asked to ship somewhere else. Shipping to any address other than the one on PayPal voids protection." : "No label yet. Ship to the address shown on the PayPal transaction.", fix: sig.addressChangeRequested ? "Politely decline, or ask the buyer to cancel and re-order with the new address." : undefined, fixAction: sig.addressChangeRequested ? "fix_address" : undefined });
  } else if (normAddr(s.labelAddress) !== normAddr(order.shipTo)) {
    checks.push({ id: "address", label: "Ships to PayPal address", state: "fail", detail: `Label goes to ${s.labelAddress.line1}, ${s.labelAddress.city}, but PayPal has ${order.shipTo.line1}, ${order.shipTo.city}. An item-not-received claim would not be covered.`, fix: "Void the label and reprint it to the PayPal address, or have the buyer re-order with the new address.", fixAction: "fix_address" });
  } else {
    checks.push({ id: "address", label: "Ships to PayPal address", state: "pass", detail: "Label address matches the PayPal transaction." });
  }

  // 3. Tracking uploaded to PayPal (also the documented lever for releasing held funds).
  if (!shipped) {
    checks.push({ id: "tracking", label: "Tracking sent to PayPal", state: "pending", detail: "Not shipped yet." });
  } else if (!order.trackingPushedToPayPal) {
    checks.push({ id: "tracking", label: "Tracking sent to PayPal", state: "fail", detail: `${s!.carrier} tracking ${s!.trackingNumber} exists but PayPal doesn't have it. PayPal keeps held funds until it sees tracking and delivery.`, fix: "Push the tracking number to PayPal.", fixAction: "push_tracking" });
  } else {
    checks.push({ id: "tracking", label: "Tracking sent to PayPal", state: "pass", detail: `${s!.carrier} ${s!.trackingNumber} is on the PayPal transaction.` });
  }

  // 4. Proof of delivery must be possible.
  if (!shipped) {
    checks.push(s?.carrier === "OTHER" || intl
      ? { id: "delivery", label: "Delivery proof possible", state: "warn", detail: intl ? "International order: pick a service whose tracking reaches “delivered” in the destination country." : "Untracked carrier selected.", fix: "Use a tracked service with a delivery scan.", fixAction: "use_tracked_carrier" }
      : { id: "delivery", label: "Delivery proof possible", state: "pending", detail: "Use a carrier service with a delivery scan." });
  } else if (s!.deliveredAt) {
    checks.push({ id: "delivery", label: "Delivery proof possible", state: "pass", detail: `Delivered ${new Date(s!.deliveredAt).toDateString()} (“${s!.lastScan ?? "delivered"}”).` });
  } else if (s!.carrier === "OTHER" || intl) {
    checks.push({ id: "delivery", label: "Delivery proof possible", state: "warn", detail: `Last scan: “${s!.lastScan ?? "unknown"}”. Many international hand-offs never show “delivered”, which voids item-not-received protection.`, fix: "Ask the destination postal service for a delivery confirmation, or contact the buyer now.", fixAction: "use_tracked_carrier" });
  } else {
    checks.push({ id: "delivery", label: "Delivery proof possible", state: "pass", detail: `In transit: “${s!.lastScan ?? "in transit"}”.` });
  }

  // 5. Signature for high-value orders.
  if (order.amount >= settings.signatureThreshold) {
    const ok = s?.signatureRequired;
    checks.push(ok
      ? { id: "signature", label: `Signature over $${settings.signatureThreshold}`, state: "pass", detail: "Signature confirmation is on the label." }
      : { id: "signature", label: `Signature over $${settings.signatureThreshold}`, state: shipped ? "fail" : "warn", detail: `$${order.amount.toFixed(0)} order${shipped ? " shipped" : ""} without signature confirmation. A “porch pirate” claim is hard to win without it.`, fix: shipped ? "Contact the carrier to add signature-on-delivery if still possible." : "Add signature confirmation to the label before shipping.", fixAction: "require_signature" });
  } else {
    checks.push({ id: "signature", label: `Signature over $${settings.signatureThreshold}`, state: "na", detail: `Order is under your $${settings.signatureThreshold} threshold.` });
  }

  // 6. Ship on time.
  const ageDays = (now - Date.parse(order.createdAt)) / DAY;
  if (!shipped && ageDays > order.promisedShipDays) {
    checks.push({ id: "ontime", label: "Shipped on time", state: "fail", detail: `${ageDays.toFixed(1)} days since payment; you promised ${order.promisedShipDays}. Late orders turn into item-not-received cases.`, fix: "Ship today and message the buyer with tracking.", fixAction: "ship_now" });
  } else if (!shipped) {
    checks.push({ id: "ontime", label: "Shipped on time", state: "pending", detail: `${Math.max(0, order.promisedShipDays - ageDays).toFixed(1)} days left in your ship window.` });
  } else {
    checks.push({ id: "ontime", label: "Shipped on time", state: "pass", detail: "Shipped within the promised window." });
  }

  // 7. Buyer signals.
  if (sig.disputeThreat) {
    checks.push({ id: "signals", label: "Buyer messages", state: "warn", detail: "Buyer has mentioned opening a case. Keep every message and send tracking proactively.", fix: "Reply with tracking and expected delivery date; keep the conversation in writing." });
  } else if (order.buyerMessages.length) {
    checks.push({ id: "signals", label: "Buyer messages", state: "pass", detail: "No risk signals in buyer messages." });
  }

  // Score and verdict.
  let score = 100;
  for (const c of checks) {
    if (c.state === "fail") score -= c.id === "tangible" || c.id === "address" ? 40 : 25;
    if (c.state === "warn") score -= 12;
  }
  score = Math.max(0, Math.min(100, score));
  const fails = checks.filter((c) => c.state === "fail");
  const warns = checks.filter((c) => c.state === "warn");
  const verdict: Verdict = intangible.length ? "not_eligible" : fails.length ? "at_risk" : warns.length ? "watch" : "protected";
  const top = fails[0] ?? warns[0];
  return { verdict, score, checks, topIssue: top ? top.label + ": " + top.detail.split(". ")[0] : undefined };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  protected: "Protected",
  watch: "Watch",
  at_risk: "At risk",
  not_eligible: "Not eligible",
};
