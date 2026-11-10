// Tiny JSON-file store. Good enough for a single-seller demo; swap for Postgres later.
import fs from "node:fs";
import path from "node:path";
import { buildDemoDb } from "./demo/seed";
import { paypalConfigured } from "./paypal/client";
import type { ApiTrace, AuditEntry, DB } from "./types";

const DATA_DIR = process.env.HOLDFAST_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "holdfast.json");

const g = globalThis as unknown as { __holdfastDb?: DB };

export function buildLiveDb(): DB {
  return {
    orders: [],
    disputes: [],
    approvals: [],
    audit: [],
    kit: [
      { id: "id", label: "Government-issued photo ID", ready: true },
      { id: "address", label: "Proof of business address (utility bill / lease)", ready: true },
      { id: "supplier", label: "Supplier invoices / proof of inventory", ready: false },
      { id: "bank", label: "Bank account statement matching PayPal name", ready: true },
      { id: "fulfilment", label: "Proof of fulfilment policy & tracked carrier", ready: true },
      { id: "policy", label: "Published refund & return policy", ready: true },
      { id: "website", label: "Live shop URL with contact details & terms", ready: true },
    ],
    settings: {
      businessName: process.env.STORE_NAME || "Test Store",
      signatureThreshold: 750,
      defaultCarrier: "USPS",
      shipWindowDays: 3,
    },
    seededAt: new Date().toISOString(),
  };
}

function load(): DB {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw) as DB;
    if (paypalConfigured()) {
      // In live mode, remove any hardcoded/demo records so only real sandbox data is shown
      const liveOrders = db.orders.filter((o) => Boolean(o.sandboxBacked));
      const liveDisputes = db.disputes.filter((d) => Boolean(d.sandboxBacked));
      const orderIdSet = new Set(liveOrders.map((o) => o.id));
      const disputeIdSet = new Set(liveDisputes.map((d) => d.id));

      db.orders = liveOrders;
      db.disputes = liveDisputes;
      db.approvals = (db.approvals ?? []).filter((a) => {
        const p = a.payload as { orderIds?: string[]; disputeId?: string; orderId?: string } | undefined;
        if (p?.orderIds && !p.orderIds.some((id) => orderIdSet.has(id))) return false;
        if (p?.orderId && !orderIdSet.has(p.orderId)) return false;
        if (p?.disputeId && !disputeIdSet.has(p.disputeId)) return false;
        return true;
      });
      if (db.settings?.businessName === "Juniper & Clay Studio") {
        db.settings.businessName = process.env.STORE_NAME || "Test Store";
      }
    }
    return db;
  } catch {
    const db = paypalConfigured() ? buildLiveDb() : buildDemoDb();
    persist(db);
    return db;
  }
}

function persist(db: DB) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  } catch (err) {
    // Read-only file systems still work; state just lives in memory.
    console.warn("[holdfast] could not persist db:", (err as Error).message);
  }
}

export function getDb(): DB {
  if (!g.__holdfastDb) g.__holdfastDb = load();
  return g.__holdfastDb;
}

export function mutate<T>(fn: (db: DB) => T): T {
  const db = getDb();
  const out = fn(db);
  persist(db);
  return out;
}

export function resetDb(): DB {
  g.__holdfastDb = paypalConfigured() ? buildLiveDb() : buildDemoDb();
  persist(g.__holdfastDb);
  return g.__holdfastDb;
}

let counter = 0;
export function newId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function audit(entry: Omit<AuditEntry, "id" | "at"> & { trace?: ApiTrace }) {
  mutate((db) => {
    db.audit.unshift({ id: newId("au"), at: new Date().toISOString(), ...entry });
    db.audit = db.audit.slice(0, 300);
  });
}
