// Thin PayPal REST client for the sandbox: OAuth token cache, request throttle (<50 req/min,
// the sandbox's IP limit), and a trace of every call so the UI can show exactly what was sent.
import type { ApiTrace } from "../types";

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.HOLDFAST_MODE !== "demo";
}

const g = globalThis as unknown as {
  __ppToken?: { value: string; exp: number };
  __ppLast?: number;
};

async function throttle() {
  const minGap = 1300; // ~46 requests/minute
  const now = Date.now();
  const wait = (g.__ppLast ?? 0) + minGap - now;
  g.__ppLast = Math.max(now, (g.__ppLast ?? 0) + minGap);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function token(): Promise<string> {
  if (g.__ppToken && g.__ppToken.exp > Date.now() + 60_000) return g.__ppToken.value;
  const id = process.env.PAYPAL_CLIENT_ID!;
  const secret = process.env.PAYPAL_CLIENT_SECRET!;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`OAuth failed (${res.status})`, res.status, await safeJson(res));
  const json = (await res.json()) as { access_token: string; expires_in: number };
  g.__ppToken = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class PayPalError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

export interface PayPalResult<T> {
  data: T;
  trace: ApiTrace;
}

export async function paypal<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  opts: { multipart?: FormData; headers?: Record<string, string> } = {},
): Promise<PayPalResult<T>> {
  await throttle();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await token()}`,
    "PayPal-Request-Id": crypto.randomUUID(),
    ...opts.headers,
  };
  let payload: BodyInit | undefined;
  if (opts.multipart) payload = opts.multipart;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, cache: "no-store" });
  const data = (await safeJson(res)) as T;
  const trace: ApiTrace = { method, path, body: body ?? (opts.multipart ? "[multipart form]" : undefined), status: res.status, response: trimForTrace(data), simulated: false };
  if (!res.ok) {
    const msg = (data as { message?: string; name?: string } | undefined)?.message ?? res.statusText;
    const err = new PayPalError(`PayPal ${method} ${path} → ${res.status}: ${msg}`, res.status, data);
    (err as PayPalError & { trace?: ApiTrace }).trace = trace;
    throw err;
  }
  return { data, trace };
}

function trimForTrace(data: unknown) {
  const s = JSON.stringify(data ?? null);
  if (s.length < 4000) return data;
  return s.slice(0, 4000) + "…";
}

// ---------- Typed helpers for the endpoints Holdfast uses ----------

export const PayPal = {
  createOrder: (body: unknown) => paypal<{ id: string; status: string }>("POST", "/v2/checkout/orders", body),
  captureOrder: (id: string) => paypal<{ id: string; status: string; purchase_units: { payments: { captures: { id: string; status: string }[] } }[] }>("POST", `/v2/checkout/orders/${id}/capture`, {}),
  getOrder: (id: string) => paypal("GET", `/v2/checkout/orders/${id}`),

  // Tracking: Orders v2 add-tracking (per order) and the batch trackers API.
  addOrderTracking: (orderId: string, b: { capture_id: string; tracking_number: string; carrier: string; notify_payer?: boolean }) =>
    paypal("POST", `/v2/checkout/orders/${orderId}/track`, { notify_payer: false, ...b }),
  addTrackersBatch: (trackers: { transaction_id: string; tracking_number: string; carrier: string; status: "SHIPPED" }[]) =>
    paypal<{ tracker_identifiers?: unknown[]; errors?: unknown[] }>("POST", "/v1/shipping/trackers-batch", { trackers }),

  searchTransactions: (startIso: string, endIso: string, page = 1) =>
    paypal<{ transaction_details: PPTransaction[]; total_pages: number }>(
      "GET",
      `/v1/reporting/transactions?start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}&fields=all&page_size=100&page=${page}`,
    ),

  listDisputes: () => paypal<{ items?: PPDisputeSummary[] }>("GET", "/v1/customer/disputes?page_size=50"),
  getDispute: (id: string) => paypal<PPDispute>("GET", `/v1/customer/disputes/${id}`),
  provideEvidence: (id: string, input: unknown) => {
    const form = new FormData();
    form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
    return paypal("POST", `/v1/customer/disputes/${id}/provide-evidence`, input, { multipart: form });
  },
  makeOffer: (id: string, amount: number, currency: string, note: string) =>
    paypal("POST", `/v1/customer/disputes/${id}/make-offer`, { note, offer_amount: { currency_code: currency, value: amount.toFixed(2) }, offer_type: "REFUND" }),
  acceptClaim: (id: string, note: string) => paypal("POST", `/v1/customer/disputes/${id}/accept-claim`, { note, accept_claim_type: "REFUND" }),
  sendMessage: (id: string, message: string) => paypal("POST", `/v1/customer/disputes/${id}/send-message`, { message }),
  // Sandbox-only helpers to move a test dispute forward.
  requireEvidence: (id: string) => paypal("POST", `/v1/customer/disputes/${id}/require-evidence`, { action: "SELLER_EVIDENCE" }),
  adjudicate: (id: string, outcome: "SELLER_FAVOR" | "BUYER_FAVOR") => paypal("POST", `/v1/customer/disputes/${id}/adjudicate`, { adjudication_outcome: outcome }),

  refundCapture: (captureId: string, amount?: { value: string; currency_code: string }, note?: string) =>
    paypal("POST", `/v2/payments/captures/${captureId}/refund`, { ...(amount ? { amount } : {}), note_to_payer: note }),

  verifyWebhook: (b: Record<string, unknown>) => paypal<{ verification_status: "SUCCESS" | "FAILURE" }>("POST", "/v1/notifications/verify-webhook-signature", b),
  createWebhook: (url: string, events: string[]) => paypal<{ id: string }>("POST", "/v1/notifications/webhooks", { url, event_types: events.map((name) => ({ name })) }),
};

export interface PPTransaction {
  transaction_info: {
    transaction_id: string;
    paypal_reference_id?: string;
    transaction_event_code?: string;
    transaction_initiation_date: string;
    transaction_amount: { currency_code: string; value: string };
    transaction_status: string;
    invoice_id?: string;
  };
  payer_info?: { email_address?: string; payer_name?: { given_name?: string; surname?: string; alternate_full_name?: string } };
  shipping_info?: { name?: string; address?: { line1?: string; city?: string; state?: string; country_code?: string; postal_code?: string } };
  cart_info?: { item_details?: { item_name?: string; item_quantity?: string; item_unit_price?: { value: string } }[] };
}

export interface PPDisputeSummary {
  dispute_id: string;
  reason: string;
  status: string;
  dispute_amount?: { currency_code: string; value: string };
  create_time: string;
  update_time?: string;
  dispute_life_cycle_stage?: string;
}

export interface PPDispute extends PPDisputeSummary {
  seller_response_due_date?: string;
  disputed_transactions?: { seller_transaction_id?: string; buyer_transaction_id?: string; custom?: string }[];
  messages?: { posted_by: string; time_posted: string; content: string }[];
  dispute_outcome?: { outcome_code: string };
}
