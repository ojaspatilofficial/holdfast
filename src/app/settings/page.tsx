import { ActionButton } from "@/components/ActionButton";
import { SandboxTools } from "@/components/SandboxTools";
import { Badge, Card, PageHeader } from "@/components/ui";
import { aiConfigured, GEMINI_MODEL } from "@/lib/ai/gemini";
import { paypalConfigured } from "@/lib/paypal/client";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const db = getDb();
  const live = paypalConfigured();
  const ai = aiConfigured();
  return (
    <>
      <PageHeader title="Settings" subtitle="Connections, demo controls and how Holdfast works." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Connections">
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt><div className="font-medium">PayPal</div><div className="text-xs text-muted">Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox app) to use the live sandbox API.</div></dt>
              <dd>{live ? <Badge tone="ok">Sandbox connected</Badge> : <Badge tone="warn">Demo mode</Badge>}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt><div className="font-medium">Gemini</div><div className="text-xs text-muted">Set GEMINI_API_KEY (free key from Google AI Studio). Model: <span className="font-mono">{GEMINI_MODEL}</span></div></dt>
              <dd>{ai ? <Badge tone="ok">On</Badge> : <Badge>Off: rule-based text</Badge>}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt><div className="font-medium">Webhooks</div><div className="text-xs text-muted">PayPal sends dispute events to <span className="font-mono">/api/webhooks/paypal</span>. Set PAYPAL_WEBHOOK_ID after creating the webhook.</div></dt>
              <dd>{process.env.PAYPAL_WEBHOOK_ID ? <Badge tone="ok">Configured</Badge> : <Badge>Not set</Badge>}</dd>
            </div>
          </dl>
          {live && <div className="mt-4"><ActionButton endpoint="/api/paypal/sync" variant="primary">Sync transactions & disputes from PayPal</ActionButton></div>}
        </Card>

        {live ? (
          <Card title="Live Store & Sandbox Data">
            <p className="mb-3 text-sm text-muted">Running with active PayPal sandbox credentials. Showing live sandbox records only.</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Business name</dt><dd className="font-medium">{db.settings.businessName}</dd>
              <dt className="text-muted">Signature threshold</dt><dd>${db.settings.signatureThreshold}</dd>
              <dt className="text-muted">Sandbox orders</dt><dd className="num font-semibold">{db.orders.length}</dd>
              <dt className="text-muted">Sandbox disputes</dt><dd className="num font-semibold">{db.disputes.length}</dd>
            </dl>
            <div className="mt-4">
              <ActionButton endpoint="/api/paypal/sync" variant="primary">Sync live data from PayPal</ActionButton>
            </div>
          </Card>
        ) : (
          <Card title="Demo controls">
            <p className="mb-3 text-sm text-muted">Demo data is fictional and rebuilt relative to today, so deadlines stay live. Resetting clears approvals and the activity log.</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton endpoint="/api/demo" body={{ action: "reset" }} variant="danger" confirm="Reset all demo data?">Reset demo data</ActionButton>
              <ActionButton endpoint="/api/demo" body={{ action: "simulate_dispute" }}>Simulate incoming dispute</ActionButton>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Business</dt><dd>{db.settings.businessName}</dd>
              <dt className="text-muted">Signature threshold</dt><dd>${db.settings.signatureThreshold}</dd>
              <dt className="text-muted">Orders</dt><dd className="num">{db.orders.length}</dd>
              <dt className="text-muted">Disputes</dt><dd className="num">{db.disputes.length}</dd>
            </dl>
          </Card>
        )}

        {live && (
          <Card title="Sandbox setup" className="lg:col-span-2">
            <SandboxTools />
          </Card>
        )}

        <Card title="How Holdfast decides" className="lg:col-span-2">
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div><div className="font-medium">Rules decide</div><p className="text-muted">Coverage, risk and deadlines come from fixed rules based on PayPal&apos;s published US Seller Protection policy, so every verdict can be checked.</p></div>
            <div><div className="font-medium">AI explains and drafts</div><p className="text-muted">Gemini reads buyer messages, explains verdicts in plain words, drafts evidence and appeal letters, and plans multi-step jobs with tools.</p></div>
            <div><div className="font-medium">You approve</div><p className="text-muted">Tracking uploads, evidence, offers and refunds only reach PayPal after you click Approve. Every call is logged with its request and response.</p></div>
          </div>
          <p className="mt-4 text-xs text-faint">Holdfast can&apos;t change PayPal&apos;s risk decisions, reserves, or the exclusion of “not as described” claims. It fixes the process mistakes that lead to them.</p>
        </Card>
      </div>
    </>
  );
}
