import { KitChecklist, LimitationAnalyzer } from "@/components/ai";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function KitPage() {
  const db = getDb();
  return (
    <>
      <PageHeader
        title="Limitation kit"
        subtitle="If PayPal limits your account, the clock starts immediately. Keep these documents ready so you can answer in hours, not weeks. Paste a notice and Holdfast works out exactly what's being asked for."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your documents"><KitChecklist kit={db.kit} /></Card>
        <Card title="✦ Answer a limitation notice"><LimitationAnalyzer /></Card>
      </div>
      <p className="mt-4 text-xs text-faint">Holdfast can&apos;t lift a limitation: only PayPal decides that. It helps you respond quickly and completely.</p>
    </>
  );
}
