import { AgentConsole } from "@/components/ai";
import { PageHeader } from "@/components/ui";

export default function AgentPage() {
  return (
    <>
      <PageHeader
        title="Agent"
        subtitle="Give Holdfast a job in plain words. It reads your orders and disputes with tools, then prepares PayPal actions for you to approve. It never moves money on its own."
      />
      <AgentConsole />
    </>
  );
}
