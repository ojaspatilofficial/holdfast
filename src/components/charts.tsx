// Small server-rendered SVG charts. No chart library needed.

export function HealthGauge({ score }: { score: number }) {
  const r = 52;
  const c = Math.PI * r; // half circle
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? "var(--color-ok)" : score >= 60 ? "var(--color-warn)" : "var(--color-bad)";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Watch" : "At risk";
  return (
    <svg viewBox="0 0 140 84" className="w-full max-w-[220px]" role="img" aria-label={`Account health ${score} out of 100, ${label}`}>
      <path d="M 18 72 A 52 52 0 0 1 122 72" fill="none" stroke="var(--color-line)" strokeWidth="12" strokeLinecap="round" />
      <path d="M 18 72 A 52 52 0 0 1 122 72" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      <text x="70" y="62" textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--color-ink)" className="num">{score}</text>
      <text x="70" y="79" textAnchor="middle" fontSize="10" fill="var(--color-muted)">{label} · out of 100</text>
    </svg>
  );
}

export function WeeklyBars({ data }: { data: { week: string; orders: number }[] }) {
  const max = Math.max(...data.map((d) => d.orders), 1);
  const w = 300;
  const h = 90;
  const bw = w / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" role="img" aria-label="Orders per week, last 12 weeks">
      {data.map((d, i) => {
        const bh = (d.orders / max) * h;
        const last = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={i * bw + 3} y={h - bh} width={bw - 6} height={bh} rx="2" fill={last ? "var(--color-warn)" : "#c9d8d3"}>
              <title>{`${d.week}: ${d.orders} orders`}</title>
            </rect>
            {(i % 3 === 2 || last) && (
              <text x={i * bw + bw / 2} y={h + 12} textAnchor="middle" fontSize="8" fill="var(--color-faint)">{d.week}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface TimelineEvent {
  at: string;
  label: string;
  kind: "deadline" | "release";
  href?: string;
}

export function DeadlineTimeline({ events, days = 21 }: { events: TimelineEvent[]; days?: number }) {
  const now = Date.now();
  const W = 800;
  const H = 120;
  const left = 20;
  const right = W - 20;
  const x = (iso: string) => left + ((Date.parse(iso) - now) / (days * 86_400_000)) * (right - left);
  const shown = events.filter((e) => {
    const t = Date.parse(e.at) - now;
    return t >= -86_400_000 && t <= days * 86_400_000;
  }).sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label="Upcoming dispute deadlines and fund releases">
        <line x1={left} x2={right} y1={60} y2={60} stroke="var(--color-line)" strokeWidth="2" />
        {Array.from({ length: days / 7 + 1 }, (_, i) => {
          const xx = left + (i * 7 * (right - left)) / days;
          return (
            <g key={i}>
              <line x1={xx} x2={xx} y1={54} y2={66} stroke="var(--color-faint)" />
              <text x={xx} y={84} fontSize="10" textAnchor="middle" fill="var(--color-faint)">{i === 0 ? "Today" : `+${i * 7}d`}</text>
            </g>
          );
        })}
        {shown.map((e, i) => {
          const xx = Math.max(left, x(e.at));
          const up = i % 2 === 0;
          const color = e.kind === "deadline" ? "var(--color-bad)" : "var(--color-ok)";
          return (
            <g key={i}>
              <line x1={xx} x2={xx} y1={60} y2={up ? 30 : 92} stroke={color} strokeDasharray="2 2" />
              {e.kind === "deadline" ? (
                <rect x={xx - 5} y={55} width={10} height={10} transform={`rotate(45 ${xx} 60)`} fill={color} />
              ) : (
                <circle cx={xx} cy={60} r={5} fill={color} />
              )}
              <text x={xx} y={up ? 24 : 106} fontSize="10" textAnchor="middle" fill="var(--color-ink)">{e.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-bad" /> Dispute response due</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" /> Held money expected back</span>
      </div>
    </div>
  );
}
