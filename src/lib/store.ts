// Tiny JSON-file store. Good enough for a single-seller demo; swap for Postgres later.
import fs from "node:fs";
import path from "node:path";
import { buildDemoDb } from "./demo/seed";
import type { ApiTrace, AuditEntry, DB, Dispute } from "./types";

const DATA_DIR = process.env.HOLDFAST_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "holdfast.json");

const g = globalThis as unknown as { __holdfastDb?: DB };

export function seedFullDb(): DB {
  const db = buildDemoDb();
  if (process.env.STORE_NAME) {
    db.settings.businessName = process.env.STORE_NAME;
  }

  // Real sandbox disputes from PayPal
  const realDisputes: Dispute[] = [
    {
      id: "PP-R-SMH-10197551",
      orderId: db.orders[0]?.id ?? "PP-11H27308UX901564P",
      captureId: db.orders[0]?.captureId ?? "11H27308UX901564P",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      stage: "INQUIRY",
      amount: 89,
      currency: "USD",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      sellerResponseDue: new Date(Date.now() + 19 * 86400000).toISOString(),
      buyerClaim: "I haven't received the tracking info",
      sandboxBacked: true,
    },
    {
      id: "PP-R-EPU-10197554",
      orderId: db.orders[1]?.id ?? "PP-6PG531448B743151R",
      captureId: db.orders[1]?.captureId ?? "6PG531448B743151R",
      reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      stage: "INQUIRY",
      amount: 89,
      currency: "USD",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      sellerResponseDue: new Date(Date.now() + 19 * 86400000).toISOString(),
      buyerClaim: "Item received was not as described in the listing",
      sandboxBacked: true,
    },
  ];

  for (const rd of realDisputes) {
    if (!db.disputes.some((d) => d.id === rd.id)) {
      db.disputes.unshift(rd);
    }
  }

  // Mark first 15 orders as sandboxBacked so sandbox actions (refund, trackers, etc.) function
  for (let i = 0; i < Math.min(15, db.orders.length); i++) {
    db.orders[i].sandboxBacked = true;
  }

  persist(db);
  return db;
}

function load(): DB {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw) as DB;
    if (!db.orders || db.orders.length === 0) {
      return seedFullDb();
    }
    return db;
  } catch {
    return seedFullDb();
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
  g.__holdfastDb = seedFullDb();
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
