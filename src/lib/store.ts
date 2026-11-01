// Tiny JSON-file store. Good enough for a single-seller demo; swap for Postgres later.
import fs from "node:fs";
import path from "node:path";
import { buildDemoDb } from "./demo/seed";
import type { ApiTrace, AuditEntry, DB } from "./types";

const DATA_DIR = process.env.HOLDFAST_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "holdfast.json");

const g = globalThis as unknown as { __holdfastDb?: DB };

function load(): DB {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw) as DB;
  } catch {
    const db = buildDemoDb();
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
  g.__holdfastDb = buildDemoDb();
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
