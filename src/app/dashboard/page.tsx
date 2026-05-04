"use client";

import { useEffect, useMemo, useState } from "react";

type Order = {
  id?: string;
  styleCode?: string;
  productType?: string;
  metal?: string;
  status?: string;
  placedBy?: string;
  createdAt?: string;
  castVendor?: string;
  castDate?: string;
  castTotal?: string | number;
  stoneTotal?: string | number;
  setter?: string;
  setTotal?: string | number;
  sellPrice?: string | number;
  extras?: Array<{ desc?: string; cost?: string }>;
};

type ApiDash = {
  productCount: number;
  totalCostCents: number;
  totalSellCents: number;
  profitCents: number;
  byMaker?: Record<string, number>;
};

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const orderCost = (o: Order): number => {
  const ct = num(o.castTotal);
  const st = num(o.stoneTotal);
  const sx = num(o.setTotal);
  const ex = (o.extras || []).reduce((a, e) => a + num(e?.cost), 0);
  return ct + st + sx + ex;
};

const monthKey = (s: string | undefined): string => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function lastSixMonths(base: Date): string[] {
  const out: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

function vendorCanon(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  const lc = v.toLowerCase();
  if (/\bmta\b/.test(lc) || /casting\s+hub/.test(lc)) return "MTA";
  if (/\bcarat\b/.test(lc)) return "CARAT";
  if (/\bmc\s*production\b/.test(lc) || /^mc\b/.test(lc)) return "MC";
  if (/^victor/.test(lc)) return "Victor";
  if (/jymp/.test(lc)) return "JYMP";
  if (/^edwin/.test(lc)) return "Edwin";
  return v;
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [apiData, setApiData] = useState<ApiDash | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [series, setSeries] = useState<"cost" | "profit">("cost");

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("lgb_orders") : null;
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) setOrders(parsed as Order[]);
    } catch {
      /* ignore — empty localStorage is fine */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const month = (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })();
        const r = await fetch(`/api/dashboard?month=${encodeURIComponent(month)}`);
        if (!r.ok) return;
        const j = (await r.json()) as ApiDash;
        if (j && typeof j.productCount === "number" && j.productCount > 0) setApiData(j);
      } catch {
        /* offline / 404 / etc. */
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const useApi = !!apiData && apiData.productCount > 0;

    const totalCost = useApi ? apiData!.totalCostCents / 100 : orders.reduce((a, o) => a + orderCost(o), 0);
    const totalSell = useApi ? apiData!.totalSellCents / 100 : orders.reduce((a, o) => a + num(o.sellPrice), 0);
    const profit = useApi ? apiData!.profitCents / 100 : totalSell - totalCost;
    const orderCount = useApi ? apiData!.productCount : orders.length;

    const vendorTotals: Record<string, { count: number; total: number }> = {};
    if (useApi && apiData!.byMaker) {
      Object.entries(apiData!.byMaker).forEach(([raw, count]) => {
        const name = vendorCanon(raw) ?? raw;
        if (!vendorTotals[name]) vendorTotals[name] = { count: 0, total: 0 };
        vendorTotals[name].count += count;
      });
    } else {
      orders.forEach((o) => {
        const cv = vendorCanon(o.castVendor);
        if (cv) {
          if (!vendorTotals[cv]) vendorTotals[cv] = { count: 0, total: 0 };
          vendorTotals[cv].count += 1;
          vendorTotals[cv].total += num(o.castTotal);
        }
        const sv = vendorCanon(o.setter);
        if (sv) {
          if (!vendorTotals[sv]) vendorTotals[sv] = { count: 0, total: 0 };
          vendorTotals[sv].count += 1;
          vendorTotals[sv].total += num(o.setTotal);
        }
      });
    }
    const vendors = Object.entries(vendorTotals)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);

    const products: Record<string, number> = {};
    orders.forEach((o) => {
      const t = (o.productType || "").trim();
      if (!t) return;
      products[t] = (products[t] ?? 0) + 1;
    });
    const productList = Object.entries(products)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const months = lastSixMonths(new Date());
    const byMonth: Record<string, { cost: number; sell: number }> = {};
    months.forEach((m) => (byMonth[m] = { cost: 0, sell: 0 }));
    orders.forEach((o) => {
      const k = monthKey(o.createdAt);
      if (!k || !(k in byMonth)) return;
      byMonth[k].cost += orderCost(o);
      byMonth[k].sell += num(o.sellPrice);
    });
    const points = months.map((m) => ({
      month: m,
      cost: byMonth[m].cost,
      profit: byMonth[m].sell - byMonth[m].cost,
    }));

    return { totalCost, totalSell, profit, orderCount, vendors, productList, points };
  }, [orders, apiData]);

  const chart = useMemo(() => {
    const w = 880;
    const h = 280;
    const pad = 36;
    const vals = stats.points.map((p) => (series === "cost" ? p.cost : p.profit));
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1);
    const span = max - min || 1;
    const pts = stats.points.map((p, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, stats.points.length - 1);
      const v = series === "cost" ? p.cost : p.profit;
      const y = h - pad - ((v - min) * (h - pad * 2)) / span;
      return { ...p, x, y, v };
    });
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { w, h, pad, pts, d };
  }, [stats.points, series]);

  const isEmpty = loaded && stats.orderCount === 0;

  return (
    <div className="lgb-page-stack max-w-6xl">
      <div className="page-hd lgb-page-hd-block">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {stats.orderCount} order{stats.orderCount === 1 ? "" : "s"} ·{" "}
            {apiData ? "synced with database" : "synced with order cards"}
          </p>
        </div>
        <div className="dash-series-toggle">
          <button
            type="button"
            className={`dash-toggle ${series === "cost" ? "is-active" : ""}`}
            onClick={() => setSeries("cost")}
          >
            Cost
          </button>
          <button
            type="button"
            className={`dash-toggle ${series === "profit" ? "is-active" : ""}`}
            onClick={() => setSeries("profit")}
          >
            Profit
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="dash-empty-card">
          <h2>No orders yet</h2>
          <p>
            Add an order from the home page and it will appear here automatically. The dashboard reads
            the same data the cards use.
          </p>
        </div>
      ) : (
        <>
          <div className="dash-kpi-row">
            <div className="dash-kpi">
              <div className="dash-kpi-label">Cost Price</div>
              <div className="dash-kpi-value">{fmtMoney(stats.totalCost)}</div>
              <div className="dash-kpi-sub">across {stats.orderCount} orders</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-label">Profit</div>
              <div
                className="dash-kpi-value"
                style={{ color: stats.profit >= 0 ? "var(--success)" : "var(--danger)" }}
              >
                {fmtMoney(stats.profit)}
              </div>
              <div className="dash-kpi-sub">
                sell {fmtMoney(stats.totalSell)} − cost {fmtMoney(stats.totalCost)}
              </div>
            </div>
          </div>

          <div className="dash-chart-card">
            <div className="dash-chart-head">
              <h2>{series === "cost" ? "Cost over time" : "Profit over time"}</h2>
              <span className="dash-chart-sub">last 6 months</span>
            </div>
            <div className="dash-chart-body">
              <svg
                width="100%"
                height={chart.h}
                viewBox={`0 0 ${chart.w} ${chart.h}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Trend chart"
              >
                <line
                  x1={chart.pad}
                  y1={chart.h - chart.pad}
                  x2={chart.w - chart.pad}
                  y2={chart.h - chart.pad}
                  stroke="var(--border2)"
                  strokeWidth={1}
                />
                <line
                  x1={chart.pad}
                  y1={chart.pad}
                  x2={chart.pad}
                  y2={chart.h - chart.pad}
                  stroke="var(--border2)"
                  strokeWidth={1}
                />
                <path
                  d={chart.d}
                  fill="none"
                  stroke="var(--peacock)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
                {chart.pts.map((p) => (
                  <g key={p.month}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="var(--peacock)" />
                    <title>{`${fmtMonthLabel(p.month)}: ${fmtMoney(p.v)}`}</title>
                    <text x={p.x} y={chart.h - 12} textAnchor="middle" fontSize={11} fill="var(--text3)">
                      {fmtMonthLabel(p.month)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="dash-row-head">By vendor</div>
          <div className="dash-vendor-row">
            {stats.vendors.length === 0 ? (
              <div className="dash-empty">No vendor data yet</div>
            ) : (
              stats.vendors.slice(0, 8).map((v) => (
                <div className="dash-vendor" key={v.name}>
                  <div className="dash-vendor-name">{v.name}</div>
                  <div className="dash-vendor-count">
                    {v.count} <span>order{v.count === 1 ? "" : "s"}</span>
                  </div>
                  {v.total > 0 ? <div className="dash-vendor-total">{fmtMoney(v.total)}</div> : null}
                </div>
              ))
            )}
          </div>

          <div className="dash-row-head">By type</div>
          <div className="dash-product-row">
            {stats.productList.length === 0 ? (
              <div className="dash-empty">No product types yet</div>
            ) : (
              stats.productList.map((p) => (
                <div className="dash-product" key={p.name}>
                  <div className="dash-product-count">{p.count}</div>
                  <div className="dash-product-name">{p.name}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
