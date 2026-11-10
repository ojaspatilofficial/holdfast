// Sandbox setup helpers:
//  1) backDemoWithSandbox: turn the demo's key orders into real sandbox payments (card test
//     payments, no buyer login needed) so tracking uploads and refunds hit the real API.
//  2) createTestCheckout / captureTestCheckout: a real PayPal-wallet checkout that the seller
//     completes as their sandbox *buyer*, so that buyer can then open a real dispute.
import { audit, getDb, mutate } from "../store";
import type { ApiTrace, Order } from "../types";
import { PayPal, PayPalError, paypalConfigured } from "./client";

const TEST_CARD = process.env.SANDBOX_TEST_CARD || "4111111111111111";
const TEST_CARD_EXPIRY = process.env.SANDBOX_TEST_CARD_EXPIRY || "2030-12";

interface CreatedOrder {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
}

function purchaseUnit(o: Order) {
  const itemTotal = o.items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
  const a = o.shipTo;
  return {
    reference_id: o.id.slice(0, 120),
    description: `Holdfast demo order for ${o.buyer.name}`.slice(0, 127),
    amount: { currency_code: o.currency, value: itemTotal.toFixed(2), breakdown: { item_total: { currency_code: o.currency, value: itemTotal.toFixed(2) } } },
    items: o.items.map((i) => ({
      name: i.name.slice(0, 127),
      quantity: String(i.quantity),
      unit_amount: { currency_code: o.currency, value: i.unitAmount.toFixed(2) },
      category: i.kind === "digital" ? "DIGITAL_GOODS" : "PHYSICAL_GOODS",
    })),
    shipping: o.items.every((i) => i.kind === "physical") && a.line1
      ? {
          name: { full_name: a.name || o.buyer.name },
          address: {
            address_line_1: a.line1,
            admin_area_2: a.city,
            ...(a.country === "US" || a.country === "CA" ? { admin_area_1: a.state } : {}),
            postal_code: a.postalCode,
            country_code: a.country,
          },
        }
      : undefined,
  };
}

function firstCapture(o: CreatedOrder) {
  return o.purchase_units?.[0]?.payments?.captures?.[0];
}

export async function backDemoWithSandbox(limit = 12) {
  if (!paypalConfigured()) return { ok: false, message: "Add PayPal sandbox keys first.", traces: [] as ApiTrace[] };
  const db = getDb();
  // Prioritise the orders the demo story uses: held, at-risk, and dispute-linked.
  const disputeOrderIds = new Set(db.disputes.map((d) => d.orderId));
  const candidates = db.orders
    .filter((o) => !o.sandboxBacked && o.currency === "USD")
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
  function score(o: Order) {
    return (o.hold.status === "held" ? 4 : 0) + (o.buyerMessages.length ? 2 : 0) + (disputeOrderIds.has(o.id) ? 1 : 0) + (o.amount > 500 ? 1 : 0);
  }

  const traces: ApiTrace[] = [];
  let done = 0;
  let lastError = "";
  for (const o of candidates) {
    try {
      const body = {
        intent: "CAPTURE",
        purchase_units: [purchaseUnit(o)],
        payment_source: { card: { number: TEST_CARD, expiry: TEST_CARD_EXPIRY, name: o.buyer.name, billing_address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" } } },
      };
      const created = await PayPal.createOrder(body);
      traces.push(created.trace);
      let order = created.data as CreatedOrder;
      let cap = firstCapture(order);
      if (!cap) {
        const captured = await PayPal.captureOrder(order.id);
        traces.push(captured.trace);
        order = captured.data as unknown as CreatedOrder;
        cap = firstCapture(order);
      }
      if (!cap) throw new Error(`Order ${order.id} has no capture (status ${order.status}).`);
      const oldId = o.id;
      mutate((d) => {
        const x = d.orders.find((y) => y.id === oldId)!;
        x.id = order.id;
        x.captureId = cap!.id;
        x.sandboxBacked = true;
        for (const dis of d.disputes) if (dis.orderId === oldId) { dis.orderId = order.id; dis.captureId = cap!.id; }
        for (const ap of d.approvals) {
          const ids = (ap.payload as { orderIds?: string[] }).orderIds;
          if (ids) (ap.payload as { orderIds: string[] }).orderIds = ids.map((i) => (i === oldId ? order.id : i));
        }
      });
      done++;
    } catch (err) {
      lastError = (err as Error).message;
      const t = (err as PayPalError & { trace?: ApiTrace }).trace;
      if (t) traces.push(t);
      if (done === 0) break; // the first one failing usually means card payments aren't enabled
    }
  }
  for (const t of traces) audit({ actor: "system", action: "Sandbox seed", detail: `${t.method} ${t.path} → ${t.status}`, trace: t });
  return done
    ? { ok: true, message: `${done} demo order(s) are now real sandbox payments.${lastError ? ` Some failed: ${lastError}` : ""}`, traces }
    : { ok: false, message: `Could not create sandbox payments: ${lastError}. Check that card payments are enabled for your sandbox app, or set SANDBOX_TEST_CARD to a card from Testing Tools → Card Testing.`, traces };
}

export async function createTestCheckout(origin: string, amount = 89) {
  if (!paypalConfigured()) return { ok: false as const, message: "Add PayPal sandbox keys first." };
  const db = getDb();
  const template: Order = {
    id: "TEST", captureId: "", createdAt: new Date().toISOString(), channel: "website",
    buyer: { name: "Sandbox Buyer", email: "" }, currency: "USD", amount,
    items: [{ name: "Holdfast test item (wool throw blanket)", quantity: 1, unitAmount: amount, kind: "physical" }],
    shipTo: { name: "", line1: "", city: "", state: "", postalCode: "", country: "US" },
    trackingPushedToPayPal: false, hold: { status: "none" }, buyerMessages: [], promisedShipDays: 3,
  };
  const pu = purchaseUnit(template);
  delete (pu as { shipping?: unknown }).shipping; // buyer's own sandbox address is used
  const body = {
    intent: "CAPTURE",
    purchase_units: [pu],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: db.settings.businessName.slice(0, 127),
          shipping_preference: "GET_FROM_FILE",
          user_action: "PAY_NOW",
          return_url: `${origin}/api/paypal/return`,
          cancel_url: `${origin}/settings`,
        },
      },
    },
  };
  try {
    const created = await PayPal.createOrder(body);
    audit({ actor: "seller", action: "Test checkout created", detail: `Order ${created.data.id}: approve it as your sandbox buyer.`, trace: created.trace });
    const approve = (created.data as CreatedOrder).links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    return { ok: true as const, orderId: created.data.id, approveUrl: approve };
  } catch (err) {
    return { ok: false as const, message: (err as Error).message };
  }
}

interface CapturedOrder extends CreatedOrder {
  payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
  purchase_units?: {
    shipping?: { name?: { full_name?: string }; address?: { address_line_1?: string; admin_area_2?: string; admin_area_1?: string; postal_code?: string; country_code?: string } };
    payments?: { captures?: { id: string; status: string; amount?: { value: string; currency_code: string }; create_time?: string }[] };
  }[];
}

export async function captureTestCheckout(orderId: string) {
  if (!paypalConfigured()) throw new Error("PayPal sandbox credentials are not configured.");
  const res = await PayPal.captureOrder(orderId);
  const o = res.data as unknown as CapturedOrder;
  const pu = o.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  if (!cap) throw new Error("Capture failed");
  const addr = pu?.shipping?.address ?? {};
  const name = [o.payer?.name?.given_name, o.payer?.name?.surname].filter(Boolean).join(" ") || "Sandbox Buyer";
  const amount = Number(cap.amount?.value ?? 0);
  mutate((db) => {
    if (db.orders.some((x) => x.id === o.id)) return;
    db.orders.unshift({
      id: o.id, captureId: cap.id, createdAt: cap.create_time ?? new Date().toISOString(), channel: "website",
      buyer: { name, email: o.payer?.email_address ?? "" }, currency: cap.amount?.currency_code ?? "USD", amount,
      items: [{ name: "Holdfast test item (wool throw blanket)", quantity: 1, unitAmount: amount, kind: "physical" }],
      shipTo: { name: pu?.shipping?.name?.full_name ?? name, line1: addr.address_line_1 ?? "", city: addr.admin_area_2 ?? "", state: addr.admin_area_1 ?? "", postalCode: addr.postal_code ?? "", country: addr.country_code ?? "US" },
      trackingPushedToPayPal: false, hold: cap.status === "PENDING" ? { status: "held", reason: "Pending on PayPal", heldSince: new Date().toISOString() } : { status: "none" },
      buyerMessages: [], promisedShipDays: 3, sandboxBacked: true,
    });
  });
  audit({ actor: "system", action: "Test checkout captured", detail: `Order ${o.id}, capture ${cap.id}, $${amount}`, trace: res.trace });
  return o.id;
}
