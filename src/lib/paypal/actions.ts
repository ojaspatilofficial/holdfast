// Money-moving and case-changing actions. Each one runs only after a seller approval.
// Live mode calls the PayPal sandbox; demo mode simulates the same request and records it as simulated.
import { audit, getDb, mutate, newId } from "../store";
import type { ApiTrace, Approval, Dispute, DisputeReason, DisputeStatus, Order } from "../types";
import { PayPal, PayPalError, paypalConfigured, type PPDispute, type PPTransaction } from "./client";

const DAY = 86_400_000;

function simulated(method: string, path: string, body: unknown, response: unknown = { status: "SIMULATED" }): ApiTrace {
  return { method, path, body, status: 200, response, simulated: true };
}

/** Calls PayPal only for records that exist in the sandbox; demo-only records are simulated. */
async function call(fn: () => Promise<{ trace: ApiTrace }>, sim: ApiTrace, backed: boolean | undefined): Promise<ApiTrace> {
  if (!paypalConfigured() || !backed) {
    await new Promise((r) => setTimeout(r, 350));
    return sim;
  }
  return (await fn()).trace;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  traces: ApiTrace[];
}

export async function executeApproval(approval: Approval): Promise<ActionResult> {
  const db = getDb();
  const p = approval.payload as Record<string, unknown>;
  const traces: ApiTrace[] = [];
  try {
    switch (approval.kind) {
      case "push_tracking": {
        const orderIds = (p.orderIds as string[]) ?? [];
        const orders = orderIds.map((id) => db.orders.find((o) => o.id === id)).filter((o): o is Order => Boolean(o?.shipment?.trackingNumber));
        if (!orders.length) return { ok: false, message: "No shipped orders with tracking in this batch.", traces };
        // Real sandbox payments go to PayPal in batches of 20; demo-only orders are simulated.
        for (const backed of [true, false]) {
          const group = orders.filter((o) => Boolean(o.sandboxBacked) === backed);
          for (let i = 0; i < group.length; i += 20) {
            const chunk = group.slice(i, i + 20);
            const trackers = chunk.map((o) => ({ transaction_id: o.captureId, tracking_number: o.shipment!.trackingNumber, carrier: o.shipment!.carrier, status: "SHIPPED" as const }));
            traces.push(await call(() => PayPal.addTrackersBatch(trackers), simulated("POST", "/v1/shipping/trackers-batch", { trackers }, { tracker_identifiers: trackers.map((t) => ({ transaction_id: t.transaction_id, tracking_number: t.tracking_number })), errors: [] }), backed));
          }
        }
        const now = Date.now();
        mutate((d) => {
          for (const o of d.orders) {
            if (!orderIds.includes(o.id)) continue;
            o.trackingPushedToPayPal = true;
            if (o.hold.status === "held") {
              if (o.shipment?.deliveredAt) {
                o.hold = { ...o.hold, status: "released", releaseEta: new Date(now).toISOString(), reason: "Released: tracking + delivery confirmed" };
              } else {
                o.hold = { ...o.hold, releaseEta: new Date(now + 2 * DAY).toISOString(), reason: "Releases on delivery scan (tracking now on file)" };
              }
            }
          }
        });
        const released = orders.filter((o) => o.shipment?.deliveredAt && o.hold.status !== "none").reduce((s, o) => s + o.amount, 0);
        return { ok: true, message: `Tracking sent for ${orders.length} order(s).${released ? ` $${released.toFixed(0)} released on delivery proof.` : ""}`, traces };
      }

      case "provide_evidence": {
        const dispute = db.disputes.find((d) => d.id === p.disputeId);
        if (!dispute) return { ok: false, message: "Dispute not found.", traces };
        const order = db.orders.find((o) => o.id === dispute.orderId);
        const notes = String(p.notes ?? "").slice(0, 2000);
        const evidences = dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" || !order?.shipment
          ? [{ evidence_type: "OTHER", notes }]
          : [{ evidence_type: "PROOF_OF_FULFILLMENT", evidence_info: { tracking_info: [{ carrier_name: order.shipment.carrier, tracking_number: order.shipment.trackingNumber }] }, notes }];
        const input = { evidences };
        traces.push(await call(() => PayPal.provideEvidence(dispute.id, input), simulated("POST", `/v1/customer/disputes/${dispute.id}/provide-evidence`, input, { links: [{ rel: "self", href: `/v1/customer/disputes/${dispute.id}` }] }), dispute.sandboxBacked));
        mutate((d) => {
          const x = d.disputes.find((y) => y.id === dispute.id)!;
          x.evidenceSubmittedAt = new Date().toISOString();
          x.status = "UNDER_REVIEW";
        });
        return { ok: true, message: `Evidence submitted for ${dispute.id}. Case is now under review.`, traces };
      }

      case "make_offer": {
        const dispute = db.disputes.find((d) => d.id === p.disputeId);
        if (!dispute) return { ok: false, message: "Dispute not found.", traces };
        const amount = Number(p.amount);
        const note = String(p.note ?? "We're sorry this wasn't right. We'd like to offer a partial refund.");
        traces.push(await call(() => PayPal.makeOffer(dispute.id, amount, dispute.currency, note), simulated("POST", `/v1/customer/disputes/${dispute.id}/make-offer`, { note, offer_amount: { currency_code: dispute.currency, value: amount.toFixed(2) }, offer_type: "REFUND" }), dispute.sandboxBacked));
        mutate((d) => {
          const x = d.disputes.find((y) => y.id === dispute.id)!;
          x.offer = { amount, at: new Date().toISOString() };
          x.status = "WAITING_FOR_BUYER_RESPONSE";
        });
        return { ok: true, message: `Offered $${amount.toFixed(2)} on ${dispute.id}. Waiting for the buyer.`, traces };
      }

      case "accept_claim": {
        const dispute = db.disputes.find((d) => d.id === p.disputeId);
        if (!dispute) return { ok: false, message: "Dispute not found.", traces };
        const note = String(p.note ?? "Accepting the claim and refunding.");
        traces.push(await call(() => PayPal.acceptClaim(dispute.id, note), simulated("POST", `/v1/customer/disputes/${dispute.id}/accept-claim`, { note, accept_claim_type: "REFUND" }), dispute.sandboxBacked));
        mutate((d) => {
          const x = d.disputes.find((y) => y.id === dispute.id)!;
          x.status = "RESOLVED";
          x.outcome = "ACCEPTED_CLAIM";
        });
        return { ok: true, message: `Claim accepted on ${dispute.id}.`, traces };
      }

      case "refund": {
        const order = db.orders.find((o) => o.id === p.orderId);
        if (!order) return { ok: false, message: "Order not found.", traces };
        // Duplicate-refund guard: refunding outside an open dispute can pay the buyer twice.
        const open = db.disputes.find((d) => d.captureId === order.captureId && d.status !== "RESOLVED");
        if (open) return { ok: false, message: `Blocked: dispute ${open.id} is open on this payment. Resolve it inside the dispute instead, or the buyer could be refunded twice.`, traces };
        const amount = p.amount ? { value: Number(p.amount).toFixed(2), currency_code: order.currency } : undefined;
        traces.push(await call(() => PayPal.refundCapture(order.captureId, amount), simulated("POST", `/v2/payments/captures/${order.captureId}/refund`, { amount }, { id: "REF-" + order.captureId.slice(-6), status: "COMPLETED" }), order.sandboxBacked));
        mutate((d) => {
          d.orders.find((o) => o.id === order.id)!.refunded = true;
        });
        return { ok: true, message: `Refunded ${amount ? "$" + amount.value : "in full"} on ${order.id}.`, traces };
      }
    }
  } catch (err) {
    const t = (err as PayPalError & { trace?: ApiTrace }).trace;
    if (t) traces.push(t);
    return { ok: false, message: (err as Error).message, traces };
  }
  return { ok: false, message: "Unknown action.", traces };
}

export function createApproval(a: Omit<Approval, "id" | "createdAt" | "status">): Approval {
  const approval: Approval = { ...a, id: newId("ap"), createdAt: new Date().toISOString(), status: "pending" };
  mutate((db) => {
    // Don't stack duplicates of the same pending action.
    const dup = db.approvals.find((x) => x.status === "pending" && x.kind === a.kind && JSON.stringify(x.payload) === JSON.stringify(a.payload));
    if (dup) return;
    db.approvals.unshift(approval);
  });
  audit({ actor: a.createdBy === "agent" ? "agent" : "seller", action: "Approval requested", detail: `${a.title}: ${a.summary}` });
  return approval;
}

export async function decideApproval(id: string, decision: "approve" | "reject"): Promise<ActionResult & { approval?: Approval }> {
  const approval = getDb().approvals.find((a) => a.id === id);
  if (!approval) return { ok: false, message: "Approval not found.", traces: [] };
  if (approval.status !== "pending") return { ok: false, message: `Already ${approval.status}.`, traces: [], approval };
  if (decision === "reject") {
    mutate((db) => {
      const a = db.approvals.find((x) => x.id === id)!;
      a.status = "rejected";
      a.decidedAt = new Date().toISOString();
    });
    audit({ actor: "seller", action: "Rejected", detail: approval.title });
    return { ok: true, message: "Rejected. Nothing was sent to PayPal.", traces: [] };
  }
  const result = await executeApproval(approval);
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id)!;
    a.status = result.ok ? "executed" : "failed";
    a.result = result.message;
    a.decidedAt = new Date().toISOString();
  });
  for (const trace of result.traces) {
    audit({ actor: "seller", action: `${result.ok ? "Approved" : "Failed"}: ${approval.title}`, detail: result.message, trace });
  }
  if (!result.traces.length) audit({ actor: "seller", action: `${result.ok ? "Approved" : "Failed"}: ${approval.title}`, detail: result.message });
  return { ...result, approval: getDb().approvals.find((x) => x.id === id) };
}

// ---------- Sandbox helpers ----------

export async function settleDispute(id: string, outcome: "SELLER_FAVOR" | "BUYER_FAVOR"): Promise<ActionResult> {
  const traces: ApiTrace[] = [];
  const backed = getDb().disputes.find((x) => x.id === id)?.sandboxBacked;
  try {
    traces.push(await call(() => PayPal.adjudicate(id, outcome), simulated("POST", `/v1/customer/disputes/${id}/adjudicate`, { adjudication_outcome: outcome }), backed));
  } catch (err) {
    const t = (err as PayPalError & { trace?: ApiTrace }).trace;
    if (t) traces.push(t);
    for (const tr of traces) audit({ actor: "seller", action: "Sandbox settle failed", detail: (err as Error).message, trace: tr });
    return { ok: false, message: (err as Error).message, traces };
  }
  mutate((db) => {
    const d = db.disputes.find((x) => x.id === id);
    if (d) {
      d.status = "RESOLVED";
      d.outcome = outcome === "SELLER_FAVOR" ? "RESOLVED_SELLER_FAVOUR" : "RESOLVED_BUYER_FAVOUR";
    }
  });
  audit({ actor: "system", action: "Sandbox dispute settled", detail: `${id} → ${outcome}`, trace: traces[0] });
  return { ok: true, message: `${id} resolved in ${outcome === "SELLER_FAVOR" ? "your" : "the buyer's"} favour (sandbox).`, traces };
}

/** Demo mode: behave like a CUSTOMER.DISPUTE.CREATED webhook for a recent delivered order. */
export function simulateIncomingDispute(): Dispute | undefined {
  const db = getDb();
  const disputed = new Set(db.disputes.map((d) => d.orderId));
  const candidate = db.orders.find((o) => o.shipment?.deliveredAt && !disputed.has(o.id) && o.trackingPushedToPayPal && o.amount > 60);
  if (!candidate) return undefined;
  const now = Date.now();
  const d: Dispute = {
    id: `PP-D-${(28000 + db.disputes.length * 7).toString()}`,
    orderId: candidate.id,
    captureId: candidate.captureId,
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status: "WAITING_FOR_SELLER_RESPONSE",
    stage: "INQUIRY",
    amount: candidate.amount,
    currency: candidate.currency,
    createdAt: new Date(now).toISOString(),
    sellerResponseDue: new Date(now + 10 * DAY).toISOString(),
    buyerClaim: "I haven't received my package.",
  };
  mutate((x) => {
    x.disputes.unshift(d);
  });
  audit({ actor: "paypal-webhook", action: "CUSTOMER.DISPUTE.CREATED (simulated)", detail: `${d.id} on order ${candidate.id}, $${d.amount}`, trace: simulated("POST", "/api/webhooks/paypal", { event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: d.id } }) });
  return d;
}

// ---------- Live sync ----------

const REASONS: DisputeReason[] = ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "UNAUTHORISED"];
const STATUSES: DisputeStatus[] = ["OPEN", "WAITING_FOR_SELLER_RESPONSE", "WAITING_FOR_BUYER_RESPONSE", "UNDER_REVIEW", "RESOLVED"];

export function upsertPayPalDispute(pp: PPDispute) {
  mutate((db) => {
    const captureId = pp.disputed_transactions?.[0]?.seller_transaction_id ?? "";
    let order = db.orders.find((o) => o.captureId === captureId);
    const amount = Number(pp.dispute_amount?.value ?? 0);
    if (!order) {
      order = {
        id: `PP-${captureId || pp.dispute_id}`, captureId, createdAt: pp.create_time, channel: "website",
        buyer: { name: "PayPal buyer", email: "" }, currency: pp.dispute_amount?.currency_code ?? "USD", amount,
        items: [{ name: "Item from PayPal transaction", quantity: 1, unitAmount: amount, kind: "physical" }],
        shipTo: { name: "", line1: "", city: "", state: "", postalCode: "", country: "US" },
        trackingPushedToPayPal: false, hold: { status: "none" }, buyerMessages: [], promisedShipDays: 3, sandboxBacked: true,
      };
      db.orders.unshift(order);
    }
    const reason = (REASONS.includes(pp.reason as DisputeReason) ? pp.reason : "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") as DisputeReason;
    const status = (STATUSES.includes(pp.status as DisputeStatus) ? pp.status : "OPEN") as DisputeStatus;
    const mapped: Dispute = {
      id: pp.dispute_id, orderId: order.id, captureId, reason, status,
      stage: pp.dispute_life_cycle_stage === "CHARGEBACK" ? "CHARGEBACK" : "INQUIRY",
      amount, currency: pp.dispute_amount?.currency_code ?? "USD", createdAt: pp.create_time,
      sellerResponseDue: pp.seller_response_due_date ?? new Date(Date.parse(pp.create_time) + 10 * DAY).toISOString(),
      buyerClaim: pp.messages?.find((m) => m.posted_by === "BUYER")?.content ?? "Opened in the PayPal Resolution Center.",
      sandboxBacked: true,
      outcome: pp.dispute_outcome?.outcome_code === "RESOLVED_SELLER_FAVOUR" ? "RESOLVED_SELLER_FAVOUR" : pp.dispute_outcome?.outcome_code === "RESOLVED_BUYER_FAVOUR" ? "RESOLVED_BUYER_FAVOUR" : undefined,
    };
    const i = db.disputes.findIndex((d) => d.id === mapped.id);
    if (i >= 0) db.disputes[i] = { ...db.disputes[i], ...mapped };
    else db.disputes.unshift(mapped);
  });
}

function upsertTransaction(t: PPTransaction) {
  const info = t.transaction_info;
  // Only incoming payments (T00xx event codes) become orders.
  if (!info.transaction_event_code?.startsWith("T00") || Number(info.transaction_amount.value) <= 0) return false;
  let added = false;
  mutate((db) => {
    if (db.orders.some((o) => o.captureId === info.transaction_id)) return;
    const name = t.payer_info?.payer_name?.alternate_full_name ?? [t.payer_info?.payer_name?.given_name, t.payer_info?.payer_name?.surname].filter(Boolean).join(" ") ?? "Buyer";
    const a = t.shipping_info?.address ?? {};
    const items = (t.cart_info?.item_details ?? []).map((i) => ({ name: i.item_name ?? "Item", quantity: Number(i.item_quantity ?? 1), unitAmount: Number(i.item_unit_price?.value ?? 0), kind: "physical" as const }));
    db.orders.unshift({
      id: info.paypal_reference_id ?? info.transaction_id, captureId: info.transaction_id, createdAt: info.transaction_initiation_date, channel: info.invoice_id ? "invoice" : "website",
      buyer: { name: name || "Buyer", email: t.payer_info?.email_address ?? "" }, currency: info.transaction_amount.currency_code, amount: Number(info.transaction_amount.value),
      items: items.length ? items : [{ name: "PayPal payment", quantity: 1, unitAmount: Number(info.transaction_amount.value), kind: "physical" }],
      shipTo: { name: t.shipping_info?.name ?? name, line1: a.line1 ?? "", city: a.city ?? "", state: a.state ?? "", postalCode: a.postal_code ?? "", country: a.country_code ?? "US" },
      trackingPushedToPayPal: false, hold: info.transaction_status === "P" ? { status: "held", reason: "Pending on PayPal", heldSince: info.transaction_initiation_date } : { status: "none" },
      buyerMessages: [], promisedShipDays: 3, sandboxBacked: true,
    });
    added = true;
  });
  return added;
}

export async function syncFromPayPal(): Promise<ActionResult> {
  if (!paypalConfigured()) return { ok: false, message: "Demo mode: add PayPal sandbox keys to sync real data.", traces: [] };
  const traces: ApiTrace[] = [];
  let txCount = 0;
  let dCount = 0;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * DAY);
    const tx = await PayPal.searchTransactions(start.toISOString().replace(/\.\d+Z$/, "Z"), end.toISOString().replace(/\.\d+Z$/, "Z"));
    traces.push(tx.trace);
    for (const t of tx.data.transaction_details ?? []) if (upsertTransaction(t)) txCount++;
  } catch (err) {
    const t = (err as PayPalError & { trace?: ApiTrace }).trace;
    if (t) traces.push(t);
  }
  try {
    const list = await PayPal.listDisputes();
    traces.push(list.trace);
    for (const s of (list.data.items ?? []).slice(0, 15)) {
      const full = await PayPal.getDispute(s.dispute_id);
      upsertPayPalDispute(full.data);
      dCount++;
    }
  } catch (err) {
    const t = (err as PayPalError & { trace?: ApiTrace }).trace;
    if (t) traces.push(t);
  }
  for (const t of traces) audit({ actor: "system", action: "PayPal sync", detail: `${t.method} ${t.path.split("?")[0]} → ${t.status}`, trace: t });
  return { ok: true, message: `Synced ${txCount} new transactions and ${dCount} disputes from the PayPal sandbox.`, traces };
}
