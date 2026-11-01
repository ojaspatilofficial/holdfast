// Builds a realistic demo dataset relative to "now", so countdowns and hold dates stay live.
// Everything here is made up; it is labelled as demo data in the UI.
import type { Address, DB, Dispute, Order, OrderItem } from "../types";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const FIRST = ["Ava", "Liam", "Noah", "Emma", "Mia", "Lucas", "Zoe", "Ethan", "Chloe", "Mason", "Aria", "Leo", "Nora", "Jack", "Ivy", "Owen", "Ruby", "Eli", "Maya", "Kai"];
const LAST = ["Patel", "Nguyen", "Garcia", "Smith", "Kim", "Johnson", "Brown", "Lopez", "Chen", "Davis", "Miller", "Wilson", "Moore", "Clark", "Lewis", "Young"];
const CITIES: [string, string, string][] = [
  ["Austin", "TX", "78701"], ["Denver", "CO", "80202"], ["Portland", "OR", "97205"], ["Columbus", "OH", "43215"],
  ["Tampa", "FL", "33602"], ["Raleigh", "NC", "27601"], ["Phoenix", "AZ", "85004"], ["Madison", "WI", "53703"],
  ["Boise", "ID", "83702"], ["Richmond", "VA", "23219"], ["Omaha", "NE", "68102"], ["Albany", "NY", "12207"],
];
const STREETS = ["Maple Ave", "Oak St", "Cedar Ln", "Pine Rd", "Lakeview Dr", "Sunset Blvd", "Hillcrest Way", "River Rd"];
const PRODUCTS: [string, number][] = [
  ["Hand-thrown ceramic mug", 34], ["Linen table runner", 48], ["Leather card wallet", 39], ["Brass desk lamp", 120],
  ["Vintage film camera strap", 29], ["Wool throw blanket", 95], ["Walnut serving board", 72], ["Silver hoop earrings", 58],
  ["Botanical print set", 44], ["Canvas tote bag", 26], ["Scented soy candle trio", 36], ["Mechanical keyboard keycaps", 64],
];
const CARRIERS = ["USPS", "UPS", "FEDEX"];

export function buildDemoDb(now = Date.now()): DB {
  const rnd = mulberry32(42);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  let seq = 1000;

  const addr = (name: string): Address => {
    const [city, state, postalCode] = pick(CITIES);
    return { name, line1: `${100 + Math.floor(rnd() * 8900)} ${pick(STREETS)}`, city, state, postalCode, country: "US" };
  };
  const ids = () => {
    seq += 1;
    const n = seq.toString(36).toUpperCase();
    return {
      id: `5O${n}${Math.floor(rnd() * 1e8).toString().padStart(8, "0")}`,
      captureId: `3C${n}${Math.floor(rnd() * 1e8).toString().padStart(8, "0")}`,
    };
  };
  const tracking = () => `9400${Math.floor(rnd() * 1e12).toString().padStart(12, "0")}${Math.floor(rnd() * 1e6)}`;

  const orders: Order[] = [];

  // Filler: healthy history over ~100 days, with a sales spike in the last 7 days.
  const filler = (daysAgo: number) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const [pname, price] = pick(PRODUCTS);
    const qty = rnd() < 0.8 ? 1 : 2;
    const created = now - daysAgo * DAY - Math.floor(rnd() * DAY);
    const to = addr(name);
    const shipped = created + DAY * (1 + Math.floor(rnd() * 2));
    const deliveredAt = shipped + DAY * (2 + Math.floor(rnd() * 3));
    const isDelivered = deliveredAt < now;
    const isShipped = shipped < now;
    const { id, captureId } = ids();
    orders.push({
      id, captureId,
      createdAt: iso(created),
      channel: pick(["website", "website", "instagram", "invoice"] as const),
      buyer: { name, email: `${name.toLowerCase().replace(" ", ".")}@example.com` },
      currency: "USD",
      amount: price * qty,
      items: [{ name: pname, quantity: qty, unitAmount: price, kind: "physical" }],
      shipTo: to,
      shipment: isShipped
        ? {
            carrier: pick(CARRIERS), trackingNumber: tracking(), labelAddress: { ...to },
            signatureRequired: false, shippedAt: iso(shipped),
            deliveredAt: isDelivered ? iso(deliveredAt) : undefined,
            lastScan: isDelivered ? "Delivered, front door" : "In transit to destination",
          }
        : undefined,
      trackingPushedToPayPal: isShipped,
      hold: { status: "none" },
      buyerMessages: [],
      promisedShipDays: 3,
    });
  };
  for (let d = 8; d < 100; d += 0.5) filler(d); // ~184 orders, ~15/week
  for (let i = 0; i < 26; i++) filler(rnd() * 6 + 0.2); // spike: ~26 orders this week

  // Hand-written demo cases, newest first in the UI.
  const special = (o: Partial<Order> & { items: OrderItem[]; buyerName: string; daysAgo: number }): Order => {
    const { id, captureId } = ids();
    const created = now - o.daysAgo * DAY;
    const shipTo = o.shipTo ?? addr(o.buyerName);
    const order: Order = {
      id, captureId,
      createdAt: iso(created),
      channel: o.channel ?? "website",
      buyer: { name: o.buyerName, email: `${o.buyerName.toLowerCase().replace(" ", ".")}@example.com` },
      currency: "USD",
      amount: o.items.reduce((s, i) => s + i.unitAmount * i.quantity, 0),
      items: o.items,
      shipTo,
      shipment: o.shipment,
      trackingPushedToPayPal: o.trackingPushedToPayPal ?? false,
      hold: o.hold ?? { status: "none" },
      buyerMessages: o.buyerMessages ?? [],
      promisedShipDays: 3,
    };
    orders.push(order);
    return order;
  };

  // 1. High-value lens, label printed without signature, tracking never sent to PayPal, funds held.
  const lensTo = addr("Daniel Okafor");
  const lens = special({
    buyerName: "Daniel Okafor", daysAgo: 2.2, shipTo: lensTo,
    items: [{ name: "Sony 24-70mm f/2.8 GM lens (used, mint)", quantity: 1, unitAmount: 924, kind: "physical" }],
    shipment: { carrier: "UPS", trackingNumber: "1Z999AA10123456784", labelAddress: { ...lensTo }, signatureRequired: false, shippedAt: iso(now - 1.1 * DAY), lastScan: "Departed facility, Louisville KY" },
    hold: { status: "held", reason: "New seller / sales pattern change (simulated)", heldSince: iso(now - 2.2 * DAY), releaseEta: iso(now + 18.8 * DAY) },
  });

  // 2. Buyer asks to ship to a different address via Instagram DM, label already printed to the new address.
  const sneakTo = addr("Priya Raman");
  special({
    buyerName: "Priya Raman", daysAgo: 0.6, channel: "instagram", shipTo: sneakTo,
    items: [{ name: "Limited-run sneakers, size 8", quantity: 1, unitAmount: 186, kind: "physical" }],
    buyerMessages: [
      { at: iso(now - 0.5 * DAY), text: "hey!! can u ship it to my cousin instead? 77 Harbor St, Newark NJ 07102. im travelling. pls hurry 🙏" },
      { at: iso(now - 0.4 * DAY), text: "also if it doesn't arrive by friday i'll just open a case lol" },
    ],
    shipment: undefined,
  });
  // Label drafted to the cousin's address (not yet shipped) – stored on a pending shipment draft.
  orders[orders.length - 1].shipment = {
    carrier: "USPS", trackingNumber: "", signatureRequired: false, shippedAt: "",
    labelAddress: { name: "Ana Raman", line1: "77 Harbor St", city: "Newark", state: "NJ", postalCode: "07102", country: "US" },
  };

  // 3. Digital product – not covered by Seller Protection at all.
  special({
    buyerName: "Marcus Bell", daysAgo: 1.3, channel: "invoice",
    items: [{ name: "Lightroom preset pack (download)", quantity: 1, unitAmount: 65, kind: "digital" }],
    trackingPushedToPayPal: false,
  });

  // 4. International shipment with a carrier that never reports "delivered".
  const caTo: Address = { name: "Olivia Tremblay", line1: "1450 Rue Peel", city: "Montréal", state: "QC", postalCode: "H3A 1S9", country: "CA" };
  special({
    buyerName: "Olivia Tremblay", daysAgo: 6, shipTo: caTo,
    items: [{ name: "Wool throw blanket", quantity: 2, unitAmount: 95, kind: "physical" }, { name: "Linen table runner", quantity: 1, unitAmount: 48, kind: "physical" }],
    shipment: { carrier: "OTHER", trackingNumber: "LX123456789US", labelAddress: { ...caTo }, signatureRequired: false, shippedAt: iso(now - 5 * DAY), lastScan: "Handed to destination postal service" },
    trackingPushedToPayPal: true,
  });

  // 5. Unfulfilled past the promised ship window.
  special({
    buyerName: "Hannah Weiss", daysAgo: 5.4,
    items: [{ name: "Brass desk lamp", quantity: 1, unitAmount: 120, kind: "physical" }],
  });

  // 6–10. Shipped, tracked with the carrier, but tracking never sent to PayPal → funds held.
  const heldNames = ["Carlos Mendes", "Grace Liu", "Tom Becker", "Fatima Noor", "Ben Carter"];
  heldNames.forEach((n, i) => {
    const to = addr(n);
    const [pname, price] = PRODUCTS[(i * 5 + 3) % PRODUCTS.length];
    const shippedAt = now - (2 + i) * DAY;
    special({
      buyerName: n, daysAgo: 3 + i, shipTo: to,
      items: [{ name: pname, quantity: 1 + (i % 2), unitAmount: price + 40, kind: "physical" }],
      shipment: {
        carrier: CARRIERS[i % 3], trackingNumber: tracking(), labelAddress: { ...to }, signatureRequired: false,
        shippedAt: iso(shippedAt),
        deliveredAt: i > 2 ? iso(shippedAt + 2 * DAY) : undefined,
        lastScan: i > 2 ? "Delivered, mailbox" : "Out for delivery",
      },
      hold: { status: "held", reason: "Payment hold: no tracking on file (simulated)", heldSince: iso(now - (3 + i) * DAY), releaseEta: iso(now + (18 - i) * DAY) },
    });
  });

  // Dispute-linked orders.
  const inrTo = addr("Jordan Reyes");
  const inrOrder = special({
    buyerName: "Jordan Reyes", daysAgo: 16, shipTo: inrTo,
    items: [{ name: "Walnut serving board", quantity: 2, unitAmount: 72, kind: "physical" }],
    shipment: { carrier: "USPS", trackingNumber: "9400111899223197428490", labelAddress: { ...inrTo }, signatureRequired: false, shippedAt: iso(now - 15 * DAY), deliveredAt: iso(now - 12 * DAY), lastScan: "Delivered, front porch/door" },
    trackingPushedToPayPal: true,
    buyerMessages: [{ at: iso(now - 4 * DAY), text: "Package never came. My neighbour might have grabbed it? Either way I want a refund." }],
  });
  const snadOrder = special({
    buyerName: "Emily Carter", daysAgo: 13,
    items: [{ name: "Hand-dyed denim jacket, size M", quantity: 1, unitAmount: 310, kind: "physical" }],
    trackingPushedToPayPal: true,
    buyerMessages: [{ at: iso(now - 3 * DAY), text: "The colour is way darker than the photos and it runs small. Not what I paid for." }],
  });
  snadOrder.shipment = { carrier: "UPS", trackingNumber: "1Z999AA10123456791", labelAddress: { ...snadOrder.shipTo }, signatureRequired: false, shippedAt: iso(now - 12 * DAY), deliveredAt: iso(now - 9 * DAY), lastScan: "Delivered, handed to resident" };
  const unauthOrder = special({
    buyerName: "Kevin Shaw", daysAgo: 20,
    items: [{ name: "Mechanical keyboard keycaps", quantity: 1, unitAmount: 95, kind: "physical" }],
    trackingPushedToPayPal: true,
  });
  unauthOrder.shipment = { carrier: "FEDEX", trackingNumber: "771234567890", labelAddress: { ...unauthOrder.shipTo }, signatureRequired: false, shippedAt: iso(now - 19 * DAY), deliveredAt: iso(now - 16 * DAY), lastScan: "Delivered, signed by K.SHAW" };
  const intlTo: Address = { name: "Lena Fischer", line1: "Torstraße 12", city: "Berlin", state: "BE", postalCode: "10119", country: "DE" };
  const intlOrder = special({
    buyerName: "Lena Fischer", daysAgo: 24, shipTo: intlTo,
    items: [{ name: "Silver hoop earrings", quantity: 2, unitAmount: 58, kind: "physical" }],
    shipment: { carrier: "OTHER", trackingNumber: "LZ998877665US", labelAddress: { ...intlTo }, signatureRequired: false, shippedAt: iso(now - 23 * DAY), lastScan: "Arrived in destination country" },
    trackingPushedToPayPal: true,
  });
  const oldOrder = special({
    buyerName: "Sam Ortiz", daysAgo: 130,
    items: [{ name: "Botanical print set", quantity: 1, unitAmount: 44, kind: "physical" }],
    trackingPushedToPayPal: true,
  });

  const dispute = (o: Order, d: Omit<Dispute, "orderId" | "captureId" | "currency" | "amount"> & { amount?: number }): Dispute => ({
    orderId: o.id, captureId: o.captureId, currency: "USD", amount: d.amount ?? o.amount, ...d,
  });

  const disputes: Dispute[] = [
    dispute(inrOrder, {
      id: "PP-D-27801", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", stage: "INQUIRY",
      createdAt: iso(now - 8 * DAY), sellerResponseDue: iso(now + 2 * DAY - 3 * 3600_000),
      buyerClaim: "I never received my order.",
    }),
    dispute(snadOrder, {
      id: "PP-D-27844", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", status: "WAITING_FOR_SELLER_RESPONSE", stage: "INQUIRY",
      createdAt: iso(now - 3 * DAY), sellerResponseDue: iso(now + 7 * DAY),
      buyerClaim: "Colour and sizing don't match the listing.",
    }),
    dispute(unauthOrder, {
      id: "PP-D-27859", reason: "UNAUTHORISED", status: "WAITING_FOR_SELLER_RESPONSE", stage: "CHARGEBACK",
      createdAt: iso(now - 4 * DAY), sellerResponseDue: iso(now + 6 * DAY),
      buyerClaim: "I didn't authorise this payment.",
    }),
    dispute(intlOrder, {
      id: "PP-D-27866", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", stage: "INQUIRY",
      createdAt: iso(now - 2 * DAY), sellerResponseDue: iso(now + 8 * DAY),
      buyerClaim: "Tracking hasn't updated in two weeks.",
    }),
    dispute(oldOrder, {
      id: "PP-D-26112", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", status: "RESOLVED", stage: "INQUIRY",
      createdAt: iso(now - 120 * DAY), sellerResponseDue: iso(now - 110 * DAY),
      buyerClaim: "Print had a crease.", outcome: "RESOLVED_BUYER_FAVOUR",
    }),
  ];

  void lens;
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    version: 1,
    orders,
    disputes,
    approvals: [],
    audit: [
      { id: "a0", at: iso(now), actor: "system", action: "Demo data loaded", detail: `${orders.length} orders and ${disputes.length} disputes created relative to today. All data is fictional.` },
    ],
    kit: [
      { id: "id", label: "Government ID (owner)", why: "PayPal verifies who controls the account.", ready: true },
      { id: "address", label: "Proof of business address (utility bill < 3 months)", why: "Confirms the business location on file.", ready: false },
      { id: "supplier", label: "Supplier invoices for your top 5 products", why: "Shows you own the goods you sell; asked for after sales spikes.", ready: false },
      { id: "bank", label: "Bank statement for the linked account", why: "Confirms the withdrawal account belongs to you.", ready: true },
      { id: "fulfilment", label: "Fulfilment proof for the last 30 days (tracking export)", why: "Shows orders were actually delivered.", ready: false },
      { id: "policy", label: "Published refund & shipping policy URL", why: "PayPal checks that buyers can see your terms.", ready: true },
      { id: "website", label: "Live website or shop link with contact details", why: "Shows a real, reachable business.", ready: true },
    ],
    settings: { signatureThreshold: 750, businessName: "Juniper & Clay Studio" },
    aiCache: {},
    seededAt: iso(now),
  };
}
