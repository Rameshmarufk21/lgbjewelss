"use client";

import { useEffect, useMemo, useState } from "react";

type Dash = {
  month: string;
  productCount: number;
  totalCostCents: number;
  totalSellCents: number;
  profitCents: number;
  byStatus: Record<string, number>;
  byMaker: Record<string, number>;
};

type Metal = {
  month: string;
  byMetal: Record<string, { lineCount: number; totalGrams: number; totalDwt: number; costCents: number }>;
  lineCount: number;
};

function prevMonths(base: string, count: number): string[] {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function DashboardPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<Dash | null>(null);
  const [metal, setMetal] = useState<Metal | null>(null);
  const [series, setSeries] = useState<Array<{ month: string; profitCents: number; productCount: number }>>([]);

  useEffect(() => {
    void (async () => {
      const [dRes, mRes] = await Promise.all([
        fetch(`/api/dashboard?month=${encodeURIComponent(month)}`),
        fetch(`/api/metal-usage?month=${encodeURIComponent(month)}`),
      ]);
      setData(await dRes.json());
      setMetal(await mRes.json());
    })();
  }, [month]);

  useEffect(() => {
    void (async () => {
      const months = prevMonths(month, 6);
      const rows = await Promise.all(
        months.map(async (mm) => {
          const r = await fetch(`/api/dashboard?month=${encodeURIComponent(mm)}`);
          const d = (await r.json()) as Dash;
          return { month: mm, profitCents: d.profitCents ?? 0, productCount: d.productCount ?? 0 };
        }),
      );
      setSeries(rows);
    })();
  }, [month]);

  const chart = useMemo(() => {
    if (!series.length) return null;
    const w = 720;
    const h = 220;
    const pad = 28;
    const vals = series.map((x) => x.profitCents / 100);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 0, 1);
    const span = max - min || 1;
    const points = series.map((s, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1);
      const y = h - pad - ((s.profitCents / 100 - min) * (h - pad * 2)) / span;
      return { ...s, x, y };
    });
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { w, h, pad, points, d, min, max };
  }, [series]);

  return (
    <div className="lgb-page-stack max-w-5xl">
      <div className="page-hd lgb-page-hd-block" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            Orders use <code>updatedAt</code>. Casting invoice lines use <code>invoiceDate</code>.
          </p>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text2)]">
          <span className="whitespace-nowrap">Month</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="fc w-auto min-w-[9.5rem]" />
        </label>
      </div>

      {chart ? (
        <div className="lgb-section">
          <h2>Profit trend (last 6 months)</h2>
          <div className="mt-3 overflow-x-auto">
            <svg width={chart.w} height={chart.h} viewBox={`0 0 ${chart.w} ${chart.h}`} role="img" aria-label="Monthly profit line chart">
              <line x1={chart.pad} y1={chart.h - chart.pad} x2={chart.w - chart.pad} y2={chart.h - chart.pad} stroke="var(--border2)" />
              <line x1={chart.pad} y1={chart.pad} x2={chart.pad} y2={chart.h - chart.pad} stroke="var(--border2)" />
              <path d={chart.d} fill="none" stroke="var(--peacock)" strokeWidth="3" />
              {chart.points.map((p) => (
                <g key={p.month}>
                  <circle cx={p.x} cy={p.y} r="4.5" fill="var(--peacock)" />
                  <title>{`${p.month}: ${(p.profitCents / 100).toFixed(2)} (${p.productCount} products)`}</title>
                  <text x={p.x} y={chart.h - 8} textAnchor="middle" fontSize="10" fill="var(--text3)">
                    {p.month.slice(5)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      ) : null}

      {!data ? (
        <p className="text-sm lgb-muted">Loading…</p>
      ) : (
        <div className="lgb-stat-grid">
          <Stat label="Products this month" value={String(data.productCount)} />
          <Stat label="Total cost" value={`${(data.totalCostCents / 100).toFixed(2)}`} />
          <Stat label="Total sell" value={`${(data.totalSellCents / 100).toFixed(2)}`} />
          <Stat
            label="Profit"
            value={`${(data.profitCents / 100).toFixed(2)}`}
            tone={data.profitCents >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      {metal && metal.lineCount > 0 ? (
        <div className="lgb-section">
          <h2>Casting metal / month (invoice lines)</h2>
          <p className="mt-1 text-xs lgb-muted">
            {metal.month} · {metal.lineCount} line(s). Labels come from your metal / karat entries.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text2)]">
            {Object.entries(metal.byMetal).map(([label, agg]) => (
              <li key={label} className="flex flex-wrap justify-between gap-2 border-b border-[var(--border)] py-2">
                <span className="font-medium text-[var(--peacock)]">{label}</span>
                <span className="lgb-muted">
                  {agg.totalGrams > 0 ? `${agg.totalGrams.toFixed(2)} g` : ""}
                  {agg.totalDwt > 0 ? ` · ${agg.totalDwt.toFixed(2)} dwt` : ""}
                  {agg.costCents > 0 ? ` · $${(agg.costCents / 100).toFixed(2)}` : ""}
                  <span className="ml-2 text-xs">({agg.lineCount} lines)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="lgb-stat">
      <div className="lgb-stat-label">{label}</div>
      <div
        className="lgb-stat-value"
        style={{
          color:
            tone === "good" ? "var(--success)" : tone === "bad" ? "var(--danger)" : "var(--peacock2)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
