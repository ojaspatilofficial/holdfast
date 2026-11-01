import { ApprovalCard } from "@/components/ai";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  const db = getDb();
  const pending = db.approvals.filter((a) => a.status === "pending");
  const done = db.approvals.filter((a) => a.status !== "pending").slice(0, 30);
  return (
    <>
      <PageHeader title="Approvals" subtitle="Every action that touches PayPal (tracking uploads, evidence, offers, refunds) waits here until you approve it. The agent can only propose." />
      <div className="space-y-3">
        {pending.length === 0 && <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">Nothing waiting. Ask the agent to “release my held money” to see proposals appear here.</p>}
        {pending.map((a) => <ApprovalCard key={a.id} a={a} />)}
      </div>
      {done.length > 0 && (
        <Card title="History" className="mt-6">
          <div className="space-y-2">{done.map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div>
        </Card>
      )}
    </>
  );
}
