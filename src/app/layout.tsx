import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { aiConfigured, GEMINI_MODEL } from "@/lib/ai/gemini";
import { paypalConfigured } from "@/lib/paypal/client";
import { getDb } from "@/lib/store";

export const metadata: Metadata = {
  title: "Holdfast · Seller protection for PayPal",
  description: "Catch the mistakes that get PayPal money held or lost to disputes, before the parcel ships.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const db = getDb();
  const pending = db.approvals.filter((a) => a.status === "pending").length;
  const openDisputes = db.disputes.filter((d) => d.status !== "RESOLVED").length;
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar
            business={db.settings.businessName}
            mode={paypalConfigured() ? "sandbox" : "demo"}
            ai={aiConfigured() ? GEMINI_MODEL : null}
            pending={pending}
            openDisputes={openDisputes}
          />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
