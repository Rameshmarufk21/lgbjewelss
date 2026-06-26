"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCompanies, type Company } from "@/lib/companies";
import { X } from "lucide-react";

type Order = {
  id?: string;
  company?: string;
  styleCode?: string;
  productType?: string;
  metal?: string;
  status?: string;
  placedBy?: string;
  createdAt?: string;
  castVendor?: string;
  castDate?: string;
  castGrams?: string | number;
  castTotal?: string | number;
  stoneTotal?: string | number;
  setter?: string;
  setPrice?: string | number;
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
  const sx = num(o.setPrice) || num(o.setTotal);
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

function fmtMoneyShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

const BREAKDOWN_CARD_CLASSES = ["s-active", "s-cost", "s-gold", "s-pending", "s-completed", "s-active"] as const;

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
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [apiData, setApiData] = useState<ApiDash | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  // "all" = both businesses combined; otherwise a company id.
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedCard, setSelectedCard] = useState<{ type: "vendor" | "productType"; name: string } | null>(null);
  const [timeScale, setTimeScale] = useState<"week" | "month" | "year">("month");

  useEffect(() => {
    function reload() {
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("lgb_orders") : null;
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) setAllOrders(parsed as Order[]);
      } catch {
        /* ignore */
      }
    }
    reload();
    setCompanies(loadCompanies());
    setCompanyFilter("all");
    setLoaded(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "lgb_orders") reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("lgb:orders-updated", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lgb:orders-updated", reload);
    };
  }, []);

  // Orders scoped to the selected company (or all when "all").
  const orders = useMemo(
    () => (companyFilter === "all" ? allOrders : allOrders.filter((o) => (o.company || "lgb") === companyFilter)),
    [allOrders, companyFilter],
  );

  const cardChartPoints = useMemo(() => {
    if (!selectedCard) return [];
    const { type, name } = selectedCard;
    const lowerName = name.toLowerCase();

    // Filter orders matching this card
    const filteredOrders = orders.filter((o) => {
      if (type === "vendor") {
        return vendorCanon(o.castVendor) === name || vendorCanon(o.setter) === name;
      }
      return (o.productType || "").trim().toLowerCase() === lowerName;
    });

    const getPriceForOrder = (o: Order): number => {
      if (type === "vendor") {
        let val = 0;
        if (vendorCanon(o.castVendor) === name) val += num(o.castTotal);
        if (vendorCanon(o.setter) === name) val += num(o.setPrice) || num(o.setTotal);
        return val;
      }
      return orderCost(o);
    };

    const now = new Date();
    const points: Array<{ label: string; price: number; orderCount: number }> = [];

    if (timeScale === "week") {
      // Last 8 weeks
      for (let i = 7; i >= 0; i--) {
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - i * 7);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        const label = startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        
        const matches = filteredOrders.filter((o) => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= startOfWeek && d <= endOfWeek;
        });
        const price = matches.reduce((sum, o) => sum + getPriceForOrder(o), 0);
        points.push({ label, price, orderCount: matches.length });
      }
    } else if (timeScale === "month") {
      // Last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

        const matches = filteredOrders.filter((o) => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= startOfMonth && d <= endOfMonth;
        });
        const price = matches.reduce((sum, o) => sum + getPriceForOrder(o), 0);
        points.push({ label, price, orderCount: matches.length });
      }
    } else {
      // Last 3 years
      for (let i = 2; i >= 0; i--) {
        const yr = now.getFullYear() - i;
        const label = String(yr);
        const startOfYear = new Date(yr, 0, 1);
        const endOfYear = new Date(yr, 11, 31, 23, 59, 59, 999);

        const matches = filteredOrders.filter((o) => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= startOfYear && d <= endOfYear;
        });
        const price = matches.reduce((sum, o) => sum + getPriceForOrder(o), 0);
        points.push({ label, price, orderCount: matches.length });
      }
    }

    return points;
  }, [orders, selectedCard, timeScale]);

  const modalChart = useMemo(() => {
    const points = cardChartPoints;
    const w = 560;
    const h = 300;
    const padding = { top: 40, right: 20, bottom: 40, left: 65 };
    const maxVal = Math.max(...points.map((p) => p.price), 100);
    
    const spacing = (w - padding.left - padding.right) / Math.max(1, points.length);
    const barWidth = Math.min(48, spacing * 0.6);

    const bars = points.map((p, i) => {
      const x = padding.left + i * spacing + (spacing - barWidth) / 2;
      const y = h - padding.bottom - (p.price / maxVal) * (h - padding.top - padding.bottom);
      const barHeight = Math.max(2, h - padding.bottom - y);
      return {
        label: p.label,
        price: p.price,
        orderCount: p.orderCount,
        x,
        y,
        w: barWidth,
        h: barHeight,
      };
    });

    return { w, h, padding, bars, maxVal };
  }, [cardChartPoints]);

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
    // The /api/dashboard feed is whole-database and not company-aware, so only
    // trust it for the combined "all" view; per-company uses the order cards.
    const useApi = companyFilter === "all" && !!apiData && apiData.productCount > 0;

    const totalCost = useApi ? apiData!.totalCostCents / 100 : orders.reduce((a, o) => a + orderCost(o), 0);
    const totalSell = useApi ? apiData!.totalSellCents / 100 : orders.reduce((a, o) => a + num(o.sellPrice), 0);
    const profit = useApi ? apiData!.profitCents / 100 : totalSell - totalCost;
    const orderCount = useApi ? apiData!.productCount : orders.length;

    // Operational stats moved here from the orders home page.
    const activeOrders = orders.filter((o) => (o.status || "") !== "Completed");
    const completedOrders = orders.filter((o) => (o.status || "") === "Completed");
    const pendingCost = activeOrders.reduce((a, o) => a + orderCost(o), 0);
    const totalGoldGrams = orders.reduce((a, o) => a + num(o.castGrams), 0);

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

    return {
      totalCost,
      totalSell,
      profit,
      orderCount,
      vendors,
      productList,
      points,
      activeCount: activeOrders.length,
      completedCount: completedOrders.length,
      pendingCost,
      totalGoldGrams,
    };
  }, [orders, apiData, companyFilter]);

  const chart = useMemo(() => {
    const w = 880;
    const h = 280;
    const pad = 36;
    const vals = stats.points.flatMap((p) => [p.cost, p.profit]);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1);
    const span = max - min || 1;
    const project = (key: "cost" | "profit") =>
      stats.points.map((p, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, stats.points.length - 1);
        const v = key === "cost" ? p.cost : p.profit;
        const y = h - pad - ((v - min) * (h - pad * 2)) / span;
        return { ...p, x, y, v };
      });
    const costPts = project("cost");
    const profitPts = project("profit");
    const line = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { w, h, pad, costPts, profitPts, costD: line(costPts), profitD: line(profitPts) };
  }, [stats.points]);

  const isEmpty = loaded && stats.orderCount === 0;
  const companyLabel =
    companyFilter === "all"
      ? "Both companies"
      : companies.find((c) => c.id === companyFilter)?.name ?? "Company";

  return (
    <div className="lgb-page-stack max-w-6xl">
      <div className="page-hd lgb-page-hd-block">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {companyLabel} · {stats.orderCount} order{stats.orderCount === 1 ? "" : "s"} ·{" "}
            {companyFilter === "all" && apiData ? "synced with database" : "synced with order cards"}
          </p>
        </div>
        <div className="dash-series-toggle">
          <button
            type="button"
            className={`dash-toggle ${companyFilter === "all" ? "is-active" : ""}`}
            onClick={() => setCompanyFilter("all")}
          >
            All
          </button>
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`dash-toggle ${companyFilter === c.id ? "is-active" : ""}`}
              onClick={() => setCompanyFilter(c.id)}
            >
              {c.short || c.name}
            </button>
          ))}
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
          <div className="dash-stats-row">
            <div className="stats-card s-active">
              <div className="stats-card-label">Active Orders</div>
              <div className="stats-card-value">{stats.activeCount}</div>
              <div className="stats-card-sub">in production</div>
            </div>
            <div className="stats-card s-pending">
              <div className="stats-card-label">Pending Cost</div>
              <div className="stats-card-value">{fmtMoneyShort(stats.pendingCost)}</div>
              <div className="stats-card-sub">across active orders</div>
            </div>
            <div className="stats-card s-gold">
              <div className="stats-card-label">Total Gold</div>
              <div className="stats-card-value">
                {stats.totalGoldGrams.toFixed(2)}
                <span className="stats-card-unit"> g</span>
              </div>
              <div className="stats-card-sub">cast across all orders</div>
            </div>
            <div className="stats-card s-cost">
              <div className="stats-card-label">Total Cost</div>
              <div className="stats-card-value">{fmtMoneyShort(stats.totalCost)}</div>
              <div className="stats-card-sub">
                sell {fmtMoneyShort(stats.totalSell)} · {stats.orderCount} order
                {stats.orderCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className={`stats-card ${stats.profit >= 0 ? "s-completed" : "s-pending"}`}>
              <div className="stats-card-label">Profit</div>
              <div className="stats-card-value">{fmtMoneyShort(stats.profit)}</div>
              <div className="stats-card-sub">
                {stats.profit >= 0 ? "net positive" : "net negative"} · all orders
              </div>
            </div>
            <div className="stats-card s-completed">
              <div className="stats-card-label">Completed</div>
              <div className="stats-card-value">{stats.completedCount}</div>
              <div className="stats-card-sub">total finished</div>
            </div>
          </div>

          <div className="dash-chart-card">
            <div className="dash-chart-head">
              <h2>Cost &amp; Profit over time</h2>
              <span className="dash-chart-sub">last 6 months · {companyLabel}</span>
            </div>
            <div className="dash-chart-legend">
              <span className="dash-legend-item">
                <span className="dash-legend-dot" style={{ background: "var(--peacock)" }} /> Cost
              </span>
              <span className="dash-legend-item">
                <span className="dash-legend-dot" style={{ background: "var(--success)" }} /> Profit
              </span>
            </div>
            <div className="dash-chart-body">
              <svg
                width="100%"
                height={chart.h}
                viewBox={`0 0 ${chart.w} ${chart.h}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Cost and profit trend chart"
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
                <path d={chart.costD} fill="none" stroke="var(--peacock)" strokeWidth={3} strokeLinejoin="round" />
                <path d={chart.profitD} fill="none" stroke="var(--success)" strokeWidth={3} strokeLinejoin="round" strokeDasharray="2 0" />
                {chart.profitPts.map((p) => (
                  <g key={`pr-${p.month}`}>
                    <circle cx={p.x} cy={p.y} r={4} fill="var(--success)" />
                    <title>{`${fmtMonthLabel(p.month)} — Profit: ${fmtMoney(p.v)}`}</title>
                  </g>
                ))}
                {chart.costPts.map((p) => (
                  <g key={`co-${p.month}`}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="var(--peacock)" />
                    <title>{`${fmtMonthLabel(p.month)} — Cost: ${fmtMoney(p.v)}`}</title>
                    <text x={p.x} y={chart.h - 12} textAnchor="middle" fontSize={11} fill="var(--text3)">
                      {fmtMonthLabel(p.month)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="dash-row-head">By vendor <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text3)", textTransform: "none", marginLeft: "6px" }}>(Click to view trend)</span></div>
          {stats.vendors.length === 0 ? (
            <div className="dash-empty">No vendor data yet</div>
          ) : (
            <div className="dash-stats-row dash-breakdown-row">
              {stats.vendors.slice(0, 8).map((v, i) => (
                <div
                  className={`stats-card ${BREAKDOWN_CARD_CLASSES[i % BREAKDOWN_CARD_CLASSES.length]}`}
                  key={v.name}
                  onClick={() => setSelectedCard({ type: "vendor", name: v.name })}
                  style={{ cursor: "pointer" }}
                >
                  <div className="stats-card-label">{v.name}</div>
                  <div className="stats-card-value">{v.count}</div>
                  <div className="stats-card-sub">
                    order{v.count === 1 ? "" : "s"}
                    {v.total > 0 ? ` · ${fmtMoneyShort(v.total)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="dash-row-head">By type <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text3)", textTransform: "none", marginLeft: "6px" }}>(Click to view trend)</span></div>
          {stats.productList.length === 0 ? (
            <div className="dash-empty">No product types yet</div>
          ) : (
            <div className="dash-stats-row dash-breakdown-row">
              {stats.productList.map((p, i) => (
                <div
                  className={`stats-card ${BREAKDOWN_CARD_CLASSES[(i + 2) % BREAKDOWN_CARD_CLASSES.length]}`}
                  key={p.name}
                  onClick={() => setSelectedCard({ type: "productType", name: p.name })}
                  style={{ cursor: "pointer" }}
                >
                  <div className="stats-card-label">{p.name}</div>
                  <div className="stats-card-value">{p.count}</div>
                  <div className="stats-card-sub">order{p.count === 1 ? "" : "s"}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trend SVG Bar Chart Modal */}
          {selectedCard ? (
            <div className="overlay open" onClick={() => setSelectedCard(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
                <div className="mhd">
                  <span className="mtitle">
                    Trend for {selectedCard.name}
                  </span>
                  <button className="mclose" onClick={() => setSelectedCard(null)}>
                    <X size={16} />
                  </button>
                </div>
                <div className="mbody" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px 20px" }}>
                  
                  {/* Time scale toggle */}
                  <div className="dash-series-toggle" style={{ alignSelf: "center", marginBottom: "4px" }}>
                    {(["week", "month", "year"] as const).map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        className={`dash-toggle ${timeScale === scale ? "is-active" : ""}`}
                        onClick={() => setTimeScale(scale)}
                        style={{ textTransform: "capitalize" }}
                      >
                        {scale}
                      </button>
                    ))}
                  </div>

                  {/* SVG Bar Chart */}
                  <div style={{ background: "var(--cream2)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border)" }}>
                    <svg
                      width="100%"
                      height={modalChart.h}
                      viewBox={`0 0 ${modalChart.w} ${modalChart.h}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Y Axis Grid Lines */}
                      <line
                        x1={modalChart.padding.left}
                        y1={modalChart.padding.top}
                        x2={modalChart.w - modalChart.padding.right}
                        y2={modalChart.padding.top}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={modalChart.padding.left}
                        y1={(modalChart.padding.top + modalChart.h - modalChart.padding.bottom) / 2}
                        x2={modalChart.w - modalChart.padding.right}
                        y2={(modalChart.padding.top + modalChart.h - modalChart.padding.bottom) / 2}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={modalChart.padding.left}
                        y1={modalChart.h - modalChart.padding.bottom}
                        x2={modalChart.w - modalChart.padding.right}
                        y2={modalChart.h - modalChart.padding.bottom}
                        stroke="var(--border2)"
                        strokeWidth={1}
                      />

                      {/* Y Axis Labels */}
                      <text x={modalChart.padding.left - 8} y={modalChart.padding.top + 4} textAnchor="end" fontSize={11} fill="var(--text3)">
                        {fmtMoneyShort(modalChart.maxVal)}
                      </text>
                      <text x={modalChart.padding.left - 8} y={(modalChart.padding.top + modalChart.h - modalChart.padding.bottom) / 2 + 4} textAnchor="end" fontSize={11} fill="var(--text3)">
                        {fmtMoneyShort(modalChart.maxVal / 2)}
                      </text>
                      <text x={modalChart.padding.left - 8} y={modalChart.h - modalChart.padding.bottom + 4} textAnchor="end" fontSize={11} fill="var(--text3)">
                        $0
                      </text>

                      {/* Bars */}
                      {modalChart.bars.map((bar, idx) => (
                        <g key={`bar-${idx}`}>
                          {/* Bar Rect */}
                          <rect
                            x={bar.x}
                            y={bar.y}
                            width={bar.w}
                            height={bar.h}
                            fill="var(--peacock)"
                            rx={4}
                            style={{ transition: "all 0.3s ease", cursor: "pointer" }}
                          />
                          {/* Order count label on top of bar */}
                          <text
                            x={bar.x + bar.w / 2}
                            y={bar.y - 8}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight="700"
                            fill="var(--peacock2)"
                          >
                            {bar.orderCount > 0 ? bar.orderCount : ""}
                          </text>
                          {/* Price label inside or near the bar if it fits */}
                          <title>{`Total Value: ${fmtMoney(bar.price)}`}</title>
                          {/* X Axis Label */}
                          <text
                            x={bar.x + bar.w / 2}
                            y={modalChart.h - 16}
                            textAnchor="middle"
                            fontSize={10}
                            fill="var(--text3)"
                          >
                            {bar.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <div style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--text3)" }}>
                    Hover over bars to see the exact monetary value. Numbers on top show order count.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
