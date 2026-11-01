"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface OrderRow {
  id: string;
  created: string;
  buyer: string;
  channel: string;
  amount: number;
  country: string;
  shipping: string;
  verdict: "protected" | "watch" | "at_risk" | "not_eligible";
  score: number;
  topIssue: string;
  hold: string;
}

const VERDICT: Record<OrderRow["verdict"], { label: string; cls: string }> = {
  protected: { label: "Protected", cls: "bg-ok-soft text-ok" },
  watch: { label: "Watch", cls: "bg-warn-soft text-warn" },
  at_risk: { label: "At risk", cls: "bg-bad-soft text-bad" },
  not_eligible: { label: "Not eligible", cls: "bg-canvas text-muted" },
};

const theme = themeQuartz.withParams({
  fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
  headerBackgroundColor: "#f8fafc",
  rowHoverColor: "#f1f6f4",
  borderColor: "#e3e7ee",
  accentColor: "#0b5d4b",
  wrapperBorderRadius: 12,
});

export function OrdersGrid({ rows }: { rows: OrderRow[] }) {
  const router = useRouter();
  const [quick, setQuick] = useState("");
  const [filter, setFilter] = useState<"all" | OrderRow["verdict"]>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    return c;
  }, [rows]);

  const data = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.verdict === filter)), [rows, filter]);

  const cols = useMemo<ColDef<OrderRow>[]>(
    () => [
      {
        field: "verdict", headerName: "Protection", width: 130,
        cellRenderer: (p: ICellRendererParams<OrderRow>) => {
          const v = VERDICT[p.data!.verdict];
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
        },
        comparator: (a: string, b: string) => ["at_risk", "watch", "not_eligible", "protected"].indexOf(a) - ["at_risk", "watch", "not_eligible", "protected"].indexOf(b),
      },
      { field: "score", headerName: "Score", width: 90, type: "numericColumn" },
      { field: "created", headerName: "Paid", width: 110, sort: "desc", valueFormatter: (p) => new Date(p.value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
      { field: "buyer", headerName: "Buyer", flex: 1, minWidth: 140 },
      { field: "amount", headerName: "Amount", width: 110, type: "numericColumn", valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
      { field: "shipping", headerName: "Shipping", width: 120 },
      { field: "country", headerName: "To", width: 70 },
      { field: "hold", headerName: "Funds", width: 100, cellRenderer: (p: ICellRendererParams<OrderRow>) => (p.value === "held" ? <span className="font-medium text-warn">On hold</span> : p.value === "released" ? <span className="text-ok">Released</span> : <span className="text-faint">Available</span>) },
      { field: "topIssue", headerName: "Top issue", flex: 2, minWidth: 220, tooltipField: "topIssue" },
      { field: "channel", headerName: "Channel", width: 105 },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "at_risk", "watch", "not_eligible", "protected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
            >
              {f === "all" ? "All" : VERDICT[f].label} <span className="num opacity-70">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search buyer, issue, order…" className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand sm:w-64" />
      </div>
      <div style={{ height: 560 }}>
        <AgGridReact<OrderRow>
          theme={theme}
          rowData={data}
          columnDefs={cols}
          quickFilterText={quick}
          getRowId={(p) => p.data.id}
          onRowClicked={(e) => e.data && router.push(`/orders/${e.data.id}`)}
          rowClass="cursor-pointer"
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100]}
          tooltipShowDelay={300}
        />
      </div>
    </div>
  );
}
