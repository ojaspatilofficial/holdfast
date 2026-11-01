# Holdfast: stop PayPal money getting stuck

Holdfast is a copilot for small sellers who get paid with PayPal. It catches the mistakes that get money **held** or **lost to disputes**, before the parcel ships. It also fixes the ones that already happened, using the PayPal sandbox APIs and Gemini.

> Built for the PayPal AI Hackathon (2026). Runs out of the box in **demo mode** with no keys. Add PayPal sandbox and Gemini keys to make it live.

## The problem

- **Frozen and held funds** are the fastest-growing PayPal complaint at the US CFPB: 1,894 complaints in 2026 so far, about 8× more than in 2023.
- PayPal scores **1.4/5 on Trustpilot** (42k+ reviews). Sudden restrictions and lost disputes are top themes.
- Many of these losses start with a **fixable process mistake**:
  - a missed 10-day dispute deadline;
  - tracking never sent to PayPal (PayPal's docs: sending tracking is how held funds get released);
  - a label printed to an address other than the one on the PayPal transaction (this voids Seller Protection);
  - no signature on an expensive parcel.

Holdfast is for owner-operators who take PayPal directly: their own site, PayPal invoices, or Instagram and WhatsApp selling. Shopify sellers already have tools for this; these sellers don't.

## What it does

| Feature | What happens |
|---|---|
| **Protection Check** | Every order is scored against US Seller Protection rules *before it ships*: tangible goods, the label matching the PayPal address, tracking on PayPal, a delivery scan, signature over your threshold, and shipping on time. Gemini explains each verdict, reads buyer DMs (for example "ship it to my cousin instead") and drafts a safe reply. |
| **Held-money release** | Finds shipped orders whose tracking PayPal doesn't have. It prepares one batch upload (`/v1/shipping/trackers-batch`) and sends it when you approve. |
| **Dispute Radar** | A live countdown on every case. Coverage is decided by rules, and the cheapest option is picked by expected cost (fight, partial offer, or accept). Gemini drafts the evidence pack. Submitting evidence, making an offer or accepting a claim goes through the Disputes API after you approve. |
| **Agent** | "Release my held money": Gemini plans with function calling over read tools and `propose_*` tools. Proposals land in an approval queue and **never move money on their own**. |
| **Account-health meter** | Tracks your 90-day dispute rate against the 1.5% fee tier, sales spikes, untracked shipments and held funds. Gemini writes a weekly brief. |
| **Limitation kit** | A document checklist. Paste a limitation notice and Gemini works out what PayPal wants, what you already have, and drafts the response. |
| **Activity & API log** | Every PayPal request and response. Simulated calls are labelled. |

### Design principle: rules decide, AI explains, you approve

Coverage and risk verdicts come from fixed rules ([`src/lib/rules`](src/lib/rules)), so they are checkable and never hallucinated. Gemini does the language work and the planning. Every call that changes money or a case waits for a human click. Holdfast is honest about its limits: it can't change PayPal's risk decisions, reserves, or the exclusion of "not as described" claims.

## PayPal APIs used (sandbox)

- **Orders v2:** create and capture (card test payments and a PayPal-wallet test checkout)
- **Add tracking:** `POST /v1/shipping/trackers-batch`
- **Disputes v1:** list, show, `provide-evidence`, `make-offer`, `accept-claim`, plus the sandbox-only `adjudicate`
- **Payments v2:** capture refunds, with a duplicate-refund guard while a dispute is open
- **Transaction Search:** `GET /v1/reporting/transactions` (sync)
- **Webhooks:** create a subscription, then `verify-webhook-signature` on the raw body using the subscription's `webhook_id`
- **OAuth 2:** cached token, and requests are throttled below the sandbox limit of 50 per minute

Code: [`src/lib/paypal/client.ts`](src/lib/paypal/client.ts), [`actions.ts`](src/lib/paypal/actions.ts), [`sandbox.ts`](src/lib/paypal/sandbox.ts).

## AI used

**Google Gemini** (`gemini-flash-lite-latest` by default: fast and on the free tier; set `GEMINI_MODEL` to change it) through the official `@google/genai` SDK.

- **Structured output** (`responseJsonSchema` built from zod schemas) for:
  - order explanations and buyer-message signals
  - dispute evidence packs
  - the weekly health brief
  - limitation-notice analysis
- **Function calling** for the agent, with 8 tools (5 read, 3 propose).
- **Free-tier friendly.** Calls are spaced out (`GEMINI_MIN_GAP_MS`) and results are cached per data fingerprint. Every AI feature also has a rule-based fallback, so the app keeps working when the free quota runs out.

Code: [`src/lib/ai`](src/lib/ai).

Other tools: **AG Grid Community** (order risk grid), Next.js 15, Tailwind CSS 4, and **Render** for hosting (`render.yaml`).

## Run it

Requires Node 20+.

```bash
git clone <this repo> && cd holdfast
npm install
npm run dev
# open http://localhost:3000 (demo mode, no keys needed)
```

### Go live with the PayPal sandbox and Gemini

1. Copy `.env.example` to `.env.local`.
2. **Gemini:** get a free key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY`.
3. **PayPal:** at <https://developer.paypal.com>, create sandbox accounts:
   - one **Business** account (US)
   - one **Personal** account (US)

   Then go to **Apps & Credentials**, choose **Sandbox**, then **Create App** (Merchant), and copy the Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Restart `npm run dev`. The sidebar now shows **PayPal: Sandbox**.
5. Open **Settings → Sandbox setup**:
   - **Create sandbox payments.** The demo's key orders become real sandbox payments, so tracking uploads and refunds hit the real API.
   - **Start test checkout.** Pay as your sandbox *personal* account. Then, at sandbox.paypal.com, open a dispute on that payment from the **Resolution Center**.
   - **Register webhook.** This needs a public HTTPS URL, so run it from the deployed app and set `PUBLIC_URL`. Without a webhook, use **Disputes → Sync from PayPal**.

### Deploy on Render

1. Push the repo to GitHub.
2. In Render, choose **New → Blueprint** and pick the repo; Render reads `render.yaml`.
3. Set the secret environment variables.
4. Set `PUBLIC_URL` to the Render URL.

The free tier has no persistent disk, so data resets to the demo set on restart.

## Project layout

```
src/lib/rules      Seller Protection checks, dispute triage, account health (deterministic)
src/lib/ai         Gemini wrapper, AI features, agent with function calling
src/lib/paypal     REST client, approval-gated actions, sandbox helpers, sync
src/lib/demo       Demo dataset (fictional, rebuilt relative to today)
src/app            Pages and API routes (Next.js App Router)
```

## Limits

- Real PayPal risk holds and limitations can't be triggered in the sandbox. In demo data they are labelled **simulated**.
- The health meter is a heuristic built from your own data, not PayPal's internal model.
- Seller Protection rules modelled are PayPal's **US** policy.
- Not legal or financial advice.

## License

MIT
