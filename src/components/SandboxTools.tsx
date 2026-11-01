"use client";

import { useState } from "react";
import { ActionButton, BTN } from "./ActionButton";

export function SandboxTools() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function testCheckout() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/paypal/test-order", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (j.approveUrl) window.location.href = j.approveUrl;
    else setMsg(j.message ?? "Could not create a test checkout.");
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-medium">1. Make the demo orders real</div>
        <p className="mb-2 text-xs text-muted">Creates sandbox card payments for the key demo orders (held, at-risk, dispute-linked), so tracking uploads and refunds go to the real sandbox API.</p>
        <ActionButton endpoint="/api/paypal/back-demo" variant="primary">Create sandbox payments</ActionButton>
      </div>
      <div>
        <div className="font-medium">2. Make a purchase as your sandbox buyer</div>
        <p className="mb-2 text-xs text-muted">Opens PayPal checkout. Log in with your sandbox <b>personal</b> account and pay. You come back here with a real order. Then open a dispute on it at sandbox.paypal.com → Resolution Center.</p>
        <button onClick={testCheckout} disabled={busy} className={`rounded-md px-3 py-1.5 text-sm font-medium ${BTN.secondary}`}>{busy ? "Creating…" : "Start test checkout"}</button>
        {msg && <p className="mt-1 text-xs text-bad">{msg}</p>}
      </div>
      <div>
        <div className="font-medium">3. Get disputes instantly</div>
        <p className="mb-2 text-xs text-muted">Registers this app&apos;s webhook with PayPal (needs the deployed HTTPS URL). Without it, use “Sync from PayPal”.</p>
        <ActionButton endpoint="/api/paypal/webhook-setup">Register webhook</ActionButton>
      </div>
    </div>
  );
}
