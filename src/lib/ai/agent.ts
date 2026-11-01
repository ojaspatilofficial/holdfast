// The Holdfast agent: Gemini function calling over read tools plus "propose_*" tools.
// Proposals only create approvals; nothing touches PayPal until the seller clicks Approve.
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { getDb } from "../store";
import type { Approval } from "../types";
import { checkOrder, VERDICT_LABEL } from "../rules/protection";
import { REASON_LABEL, triageDispute } from "../rules/disputes";
import { computeHealth } from "../rules/health";
import { createApproval } from "../paypal/actions";
import { aiConfigured, fallbackNote, geminiCall, SYSTEM_BASE } from "./gemini";

const AGENT_DEADLINE_MS = 100_000; // stay inside the API route's 120s limit
const MAX_STEPS = 8;

export interface AgentStep {
  kind: "tool" | "proposal" | "final" | "note";
  title: string;
  detail?: string;
}

export interface AgentRun {
  goal: string;
  source: "gemini" | "rules";
  steps: AgentStep[];
  answer: string;
  approvals: Approval[];
  note?: string;
}

const tools: FunctionDeclaration[] = [
  { name: "get_account_health", description: "Account-health heuristics: dispute rate, volume spike, untracked shipments, held funds, deadlines.", parametersJsonSchema: { type: "object", properties: {} } },
  {
    name: "list_orders",
    description: "List orders with their Seller Protection verdict. filter: held (funds on hold), at_risk, unshipped, untracked (shipped but tracking not on PayPal), recent.",
    parametersJsonSchema: { type: "object", properties: { filter: { type: "string", enum: ["held", "at_risk", "unshipped", "untracked", "recent"] }, limit: { type: "integer" } }, required: ["filter"] },
  },
  { name: "get_order", description: "Full detail and protection checks for one order.", parametersJsonSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] } },
  { name: "list_disputes", description: "Open disputes with deadline, coverage and the rules engine's recommendation.", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "get_dispute", description: "One dispute with full triage: coverage, evidence available, option costs.", parametersJsonSchema: { type: "object", properties: { disputeId: { type: "string" } }, required: ["disputeId"] } },
  {
    name: "propose_tracking_push",
    description: "Queue a batch upload of tracking numbers to PayPal for shipped orders (releases held funds on delivery). Creates an approval for the seller; does not send anything.",
    parametersJsonSchema: { type: "object", properties: { orderIds: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, required: ["orderIds", "reason"] },
  },
  {
    name: "propose_evidence",
    description: "Queue a dispute evidence submission with the seller's written response. Creates an approval.",
    parametersJsonSchema: { type: "object", properties: { disputeId: { type: "string" }, notes: { type: "string", description: "Response text to PayPal, factual, 60-150 words" } }, required: ["disputeId", "notes"] },
  },
  {
    name: "propose_offer",
    description: "Queue a partial-refund offer on a dispute (best for not-as-described claims). Creates an approval.",
    parametersJsonSchema: { type: "object", properties: { disputeId: { type: "string" }, amount: { type: "number" }, note: { type: "string" } }, required: ["disputeId", "amount", "note"] },
  },
];

function orderRow(id: string) {
  const db = getDb();
  const o = db.orders.find((x) => x.id === id);
  if (!o) return undefined;
  const r = checkOrder(o, db.settings);
  return { orderId: o.id, buyer: o.buyer.name, amount: o.amount, shipped: Boolean(o.shipment?.shippedAt), delivered: Boolean(o.shipment?.deliveredAt), trackingNumber: o.shipment?.trackingNumber || null, trackingOnPayPal: o.trackingPushedToPayPal, hold: o.hold.status, verdict: VERDICT_LABEL[r.verdict], topIssue: r.topIssue ?? null };
}

function runTool(name: string, args: Record<string, unknown>, created: Approval[]): { result: unknown; step: AgentStep } {
  const db = getDb();
  switch (name) {
    case "get_account_health": {
      const h = computeHealth(db);
      return { result: { score: h.score, factors: h.factors.map((f) => ({ label: f.label, value: f.value, level: f.level })) }, step: { kind: "tool", title: "Checked account health", detail: `Score ${h.score}/100` } };
    }
    case "list_orders": {
      const filter = String(args.filter ?? "recent");
      const limit = Math.min(Number(args.limit ?? 15), 25);
      const now = Date.now();
      const rows = db.orders
        .filter((o) => {
          if (filter === "held") return o.hold.status === "held";
          if (filter === "untracked") return Boolean(o.shipment?.shippedAt) && !o.trackingPushedToPayPal;
          if (filter === "unshipped") return !o.shipment?.shippedAt;
          if (filter === "at_risk") return now - Date.parse(o.createdAt) < 30 * 86_400_000 && checkOrder(o, db.settings).verdict === "at_risk";
          return true;
        })
        .slice(0, limit)
        .map((o) => orderRow(o.id));
      return { result: rows, step: { kind: "tool", title: `Listed ${filter} orders`, detail: `${rows.length} found` } };
    }
    case "get_order": {
      const o = db.orders.find((x) => x.id === args.orderId);
      if (!o) return { result: { error: "not found" }, step: { kind: "tool", title: `Order ${String(args.orderId)} not found` } };
      const r = checkOrder(o, db.settings);
      return { result: { ...orderRow(o.id), items: o.items, shipTo: o.shipTo, shipment: o.shipment, messages: o.buyerMessages, checks: r.checks.map((c) => ({ check: c.label, state: c.state, detail: c.detail })) }, step: { kind: "tool", title: `Read order ${o.id}`, detail: VERDICT_LABEL[r.verdict] } };
    }
    case "list_disputes": {
      const rows = db.disputes.filter((d) => d.status !== "RESOLVED").map((d) => {
        const t = triageDispute(d, db.orders.find((o) => o.id === d.orderId));
        return { disputeId: d.id, reason: REASON_LABEL[d.reason], status: d.status, amount: d.amount, hoursLeft: Math.round(t.hoursLeft), covered: t.covered, recommended: t.recommended.label, evidenceSubmitted: Boolean(d.evidenceSubmittedAt) };
      });
      return { result: rows, step: { kind: "tool", title: "Listed open disputes", detail: `${rows.length} open` } };
    }
    case "get_dispute": {
      const d = db.disputes.find((x) => x.id === args.disputeId);
      if (!d) return { result: { error: "not found" }, step: { kind: "tool", title: `Dispute ${String(args.disputeId)} not found` } };
      const o = db.orders.find((x) => x.id === d.orderId);
      const t = triageDispute(d, o);
      return { result: { dispute: d, order: o && { id: o.id, items: o.items, shipTo: o.shipTo, shipment: o.shipment, messages: o.buyerMessages }, triage: t }, step: { kind: "tool", title: `Triaged ${d.id}`, detail: `${REASON_LABEL[d.reason]}: ${t.covered ? "covered" : "not covered"}, ${Math.round(t.hoursLeft)}h left` } };
    }
    case "propose_tracking_push": {
      const ids = ((args.orderIds as string[]) ?? []).filter((id) => {
        const o = db.orders.find((x) => x.id === id);
        return o?.shipment?.trackingNumber && !o.trackingPushedToPayPal;
      });
      if (!ids.length) return { result: { error: "None of those orders are shipped-with-tracking and missing on PayPal." }, step: { kind: "note", title: "Skipped tracking proposal", detail: "No eligible orders" } };
      const total = ids.reduce((s, id) => s + (db.orders.find((o) => o.id === id)?.amount ?? 0), 0);
      const a = createApproval({ kind: "push_tracking", title: `Send tracking for ${ids.length} order(s)`, summary: `${String(args.reason ?? "")} ($${total.toFixed(0)} in payments)`, createdBy: "agent", payload: { orderIds: ids } });
      created.push(a);
      return { result: { approvalId: a.id, status: "waiting for seller approval" }, step: { kind: "proposal", title: a.title, detail: a.summary } };
    }
    case "propose_evidence": {
      const d = db.disputes.find((x) => x.id === args.disputeId);
      if (!d || d.status === "RESOLVED" || d.evidenceSubmittedAt) return { result: { error: "Dispute not open for evidence" }, step: { kind: "note", title: "Skipped evidence proposal" } };
      const a = createApproval({ kind: "provide_evidence", title: `Submit evidence on ${d.id}`, summary: String(args.notes ?? "").slice(0, 160), createdBy: "agent", payload: { disputeId: d.id, notes: String(args.notes ?? "") } });
      created.push(a);
      return { result: { approvalId: a.id, status: "waiting for seller approval" }, step: { kind: "proposal", title: a.title, detail: "Evidence drafted for your review" } };
    }
    case "propose_offer": {
      const d = db.disputes.find((x) => x.id === args.disputeId);
      const amount = Math.max(1, Math.min(Number(args.amount), d?.amount ?? 0));
      if (!d || d.status === "RESOLVED") return { result: { error: "Dispute not open" }, step: { kind: "note", title: "Skipped offer proposal" } };
      const a = createApproval({ kind: "make_offer", title: `Offer $${amount.toFixed(0)} on ${d.id}`, summary: String(args.note ?? ""), createdBy: "agent", payload: { disputeId: d.id, amount, note: String(args.note ?? "") } });
      created.push(a);
      return { result: { approvalId: a.id, status: "waiting for seller approval" }, step: { kind: "proposal", title: a.title, detail: a.summary } };
    }
  }
  return { result: { error: "unknown tool" }, step: { kind: "note", title: `Unknown tool ${name}` } };
}

const AGENT_SYSTEM = `${SYSTEM_BASE}
You are running as an agent with tools. Work step by step: read data with the get/list tools, then use propose_* tools for any action. You cannot move money yourself; proposals wait for the seller's approval, so say that.
Only propose actions the data supports: tracking pushes only for shipped orders whose tracking isn't on PayPal. For each open dispute, follow the rules engine's "recommended" option: "Fight with evidence" → propose_evidence; a partial refund → propose_offer with that amount; "Accept" → don't propose, tell the seller to review it.
Finish with a short answer in plain text (no markdown, no asterisks, max 120 words) that lists what you found and what is waiting for approval.`;

export async function runAgent(goal: string): Promise<AgentRun> {
  const created: Approval[] = [];
  const steps: AgentStep[] = [];
  if (!aiConfigured()) return rulePlanner(goal, "AI is off (no GEMINI_API_KEY). The rule-based planner ran instead.");

  const contents: Content[] = [{ role: "user", parts: [{ text: goal }] }];
  const started = Date.now();
  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const left = AGENT_DEADLINE_MS - (Date.now() - started);
      if (left < 8_000) break;
      const res = await geminiCall(
        { contents, config: { systemInstruction: AGENT_SYSTEM, tools: [{ functionDeclarations: tools }] } },
        Math.min(left, 45_000),
      );
      const turn = res.candidates?.[0]?.content;
      if (turn) contents.push(turn);
      const calls = res.functionCalls ?? [];
      if (!calls.length) {
        const answer = (res.text ?? "Done.").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[-*]\s+/gm, "• ").trim();
        steps.push({ kind: "final", title: "Summary", detail: answer });
        return { goal, source: "gemini", steps, answer, approvals: created };
      }
      const parts: Part[] = [];
      for (const call of calls) {
        const { result, step } = runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>, created);
        steps.push(step);
        parts.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
    }
    const answer = created.length
      ? `I ran out of time or steps. I prepared ${created.length} action(s); they're waiting for your approval below.`
      : "I ran out of time before finishing. Try a narrower request, e.g. “Release my held money”.";
    steps.push({ kind: "final", title: "Summary", detail: answer });
    return { goal, source: "gemini", steps, answer, approvals: created };
  } catch (err) {
    // Finish the job deterministically. Proposals already created stay; duplicates are skipped.
    const fallback = rulePlanner(goal, `${fallbackNote(err).replace("showing rule-based text", "the rule-based planner finished the job")}`);
    return { ...fallback, steps: [...steps, ...fallback.steps], approvals: dedupe([...created, ...fallback.approvals]) };
  }
}

function dedupe(list: Approval[]) {
  const seen = new Set<string>();
  return list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

/** Deterministic planner used when Gemini is unavailable. Same tools, same approval gates. */
function rulePlanner(goal: string, note: string): AgentRun {
  const created: Approval[] = [];
  const steps: AgentStep[] = [];
  const wantHolds = /hold|held|release|tracking|cash|money/i.test(goal);
  const wantDisputes = /dispute|case|claim|chargeback/i.test(goal);
  const both = !wantHolds && !wantDisputes;
  const lines: string[] = [];

  steps.push(runTool("get_account_health", {}, created).step);
  if (wantHolds || both) {
    const r = runTool("list_orders", { filter: "untracked", limit: 25 }, created);
    steps.push(r.step);
    const ids = (r.result as { orderId: string }[]).map((x) => x.orderId);
    if (ids.length) {
      const p = runTool("propose_tracking_push", { orderIds: ids, reason: "Shipped orders whose tracking PayPal doesn't have yet" }, created);
      steps.push(p.step);
      lines.push(`${ids.length} shipped order(s) are missing tracking on PayPal; a batch upload is waiting for your approval.`);
    } else lines.push("Every shipped order already has tracking on PayPal.");
  }
  if (wantDisputes || both) {
    const r = runTool("list_disputes", {}, created);
    steps.push(r.step);
    for (const d of r.result as { disputeId: string; covered: boolean; evidenceSubmitted: boolean }[]) {
      const g = runTool("get_dispute", { disputeId: d.disputeId }, created);
      steps.push(g.step);
      const t = (g.result as { triage: ReturnType<typeof triageDispute>; dispute: { amount: number } }).triage;
      if (d.evidenceSubmitted) continue;
      if (t.recommended.action === "fight" && t.covered) {
        const p = runTool("propose_evidence", { disputeId: d.disputeId, notes: `Shipped with tracking to the address on the PayPal transaction; carrier confirms delivery. Tracking is attached to the transaction. ${t.coverageReason}` }, created);
        steps.push(p.step);
        lines.push(`${d.disputeId}: covered, evidence drafted for approval.`);
      } else if (t.recommended.action === "partial_offer") {
        const p = runTool("propose_offer", { disputeId: d.disputeId, amount: t.recommended.offerAmount, note: "Sorry this wasn't what you expected. We'd like to offer a partial refund so you can keep the item." }, created);
        steps.push(p.step);
        lines.push(`${d.disputeId}: not covered, a partial offer is cheaper than fighting; offer queued.`);
      } else {
        lines.push(`${d.disputeId}: ${t.recommended.label.toLowerCase()} recommended; review it on the dispute page.`);
      }
    }
  }
  const answer = lines.join(" ") + " Nothing is sent to PayPal until you approve.";
  steps.push({ kind: "final", title: "Summary", detail: answer });
  return { goal, source: "rules", steps, answer, approvals: created, note };
}
