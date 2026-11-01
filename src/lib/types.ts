// Core data model for Holdfast. Field names follow PayPal's REST APIs where they overlap.

export type ItemKind = "physical" | "digital" | "service";

export interface Address {
  name: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO-2
}

export interface OrderItem {
  name: string;
  quantity: number;
  unitAmount: number;
  kind: ItemKind;
}

export interface Shipment {
  carrier: string; // PayPal carrier enum, e.g. USPS, UPS, FEDEX, DHL, OTHER
  trackingNumber: string;
  labelAddress: Address;
  signatureRequired: boolean;
  shippedAt: string;
  deliveredAt?: string;
  lastScan?: string; // free-text carrier event, e.g. "Delivered, front porch"
}

export type HoldStatus = "none" | "held" | "released";

export interface Order {
  id: string; // PayPal order id
  captureId: string; // PayPal capture (transaction) id
  createdAt: string;
  channel: "website" | "invoice" | "instagram" | "whatsapp";
  buyer: { name: string; email: string };
  currency: string;
  amount: number;
  items: OrderItem[];
  shipTo: Address; // address on the PayPal Transaction Details page
  shipment?: Shipment;
  trackingPushedToPayPal: boolean;
  hold: { status: HoldStatus; reason?: string; heldSince?: string; releaseEta?: string };
  refunded?: boolean;
  buyerMessages: { at: string; text: string }[];
  promisedShipDays: number;
}

export type DisputeReason =
  | "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
  | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
  | "UNAUTHORISED";

export type DisputeStatus =
  | "OPEN"
  | "WAITING_FOR_SELLER_RESPONSE"
  | "WAITING_FOR_BUYER_RESPONSE"
  | "UNDER_REVIEW"
  | "RESOLVED";

export interface Dispute {
  id: string; // PP-D-xxxx
  orderId: string;
  captureId: string;
  reason: DisputeReason;
  status: DisputeStatus;
  stage: "INQUIRY" | "CHARGEBACK";
  amount: number;
  currency: string;
  createdAt: string;
  sellerResponseDue: string;
  buyerClaim: string;
  outcome?: "RESOLVED_SELLER_FAVOUR" | "RESOLVED_BUYER_FAVOUR" | "OFFER_ACCEPTED" | "ACCEPTED_CLAIM";
  evidenceSubmittedAt?: string;
  offer?: { amount: number; at: string };
}

export type ApprovalKind =
  | "push_tracking"
  | "provide_evidence"
  | "make_offer"
  | "accept_claim"
  | "refund";

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  summary: string;
  createdBy: "agent" | "user";
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  payload: Record<string, unknown>;
  result?: string;
  decidedAt?: string;
}

export interface ApiTrace {
  method: string;
  path: string;
  body?: unknown;
  status: number;
  response?: unknown;
  simulated: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: "seller" | "agent" | "system" | "paypal-webhook";
  action: string;
  detail: string;
  trace?: ApiTrace;
}

export interface KitDoc {
  id: string;
  label: string;
  why: string;
  ready: boolean;
}

export interface Settings {
  signatureThreshold: number; // USD; PayPal US names none, seller chooses
  businessName: string;
}

export interface AiCacheEntry {
  at: string;
  value: unknown;
}

export interface DB {
  version: number;
  orders: Order[];
  disputes: Dispute[];
  approvals: Approval[];
  audit: AuditEntry[];
  kit: KitDoc[];
  settings: Settings;
  aiCache: Record<string, AiCacheEntry>;
  seededAt: string;
}
