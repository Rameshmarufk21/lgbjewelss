"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCompanies, type Company } from "@/lib/companies";

type Order = {
  id?: string;
  company?: string;
  productType?: string;
  status?: string;
  createdAt?: string;
  castVendor?: string;
  castGrams?: string | number;
  castTotal?: string | number;
  stoneTotal?: string | number;
  setter?: string;
  setTotal?: string | number;
  sellPrice?: string | number;
  extras?: Array<{ desc?: string; cost?: string }>;
};

type Payment = { company?: string; category?: string; amount?: number; paidOn?: string };

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const orderCost = (o: Order): number =>
  num(o.castTotal) + num(o.stoneTotal) + num(o.setTotal) + (o.extras || []).reduce((a, e) => a + num(e?.cost), 0);

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function withinRange(d: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!d) return false;
  const day = d.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function vendorCanon(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const lc = raw.trim().toLowerCase();
  if (/\bmta\b/.test(lc) || /casting\s+hub/.test(lc)) return "MTA";
  if (/\bcarat\b/.test(lc)) return "CARAT";
  if (/\bmc\b/.test(lc)) return "MC Production";
  if (/^victor/.test(lc)) return "Victor";
  if (/jymp/.test(lc)) return "JYMP";
  if (/^edwin/.test(lc)) return "Edwin";
  return raw.trim();
}

const STATUSES = ["Inquiry", "Casting", "At Setter", "Hold", "Blocked", "Completed"];

type ReportData = {
  orderCount: number;
  active: number;
  completed: number;
  totalCost: number;
  totalSell: number;
  profit: number;
  gold: number;
  paidTotal: number;
  outstanding: number;
  byStatus: { name: string; count: number; cost: number }[];
  byVendor: { name: string; count: number; total: number }[];
  byType: { name: string; count: number }[];
};

function computeReport(items: Order[], pays: Payment[]): ReportData {
  const totalCost = items.reduce((a, o) => a + orderCost(o), 0);
  const totalSell = items.reduce((a, o) => a + num(o.sellPrice), 0);
  const gold = items.reduce((a, o) => a + num(o.castGrams), 0);
  const paidTotal = pays.reduce((a, p) => a + num(p.amount), 0);

  const statusMap = new Map<string, { count: number; cost: number }>();
  STATUSES.forEach((s) => statusMap.set(s, { count: 0, cost: 0 }));
  items.forEach((o) => {
    const s = o.status || "Inquiry";
    const cur = statusMap.get(s) || { count: 0, cost: 0 };
    cur.count += 1;
    cur.cost += orderCost(o);
    statusMap.set(s, cur);
  });

  const vendorMap = new Map<string, { count: number; total: number }>();
  items.forEach((o) => {
    const cv = vendorCanon(o.castVendor);
    if (cv) {
      const c = vendorMap.get(cv) || { count: 0, total: 0 };
      c.count += 1;
      c.total += num(o.castTotal);
      vendorMap.set(cv, c);
    }
    const sv = vendorCanon(o.setter);
    if (sv) {
      const c = vendorMap.get(sv) || { count: 0, total: 0 };
      c.count += 1;
      c.total += num(o.setTotal);
      vendorMap.set(sv, c);
    }
  });

  const typeMap = new Map<string, number>();
  items.forEach((o) => {
    const t = (o.productType || "").trim();
    if (t) typeMap.set(t, (typeMap.get(t) || 0) + 1);
  });

  return {
    orderCount: items.length,
    active: items.filter((o) => (o.status || "") !== "Completed").length,
    completed: items.filter((o) => (o.status || "") === "Completed").length,
    totalCost,
    totalSell,
    profit: totalSell - totalCost,
    gold,
    paidTotal,
    outstanding: totalCost - paidTotal,
    byStatus: STATUSES.map((s) => ({ name: s, ...(statusMap.get(s) || { count: 0, cost: 0 }) })).filter((r) => r.count > 0),
    byVendor: [...vendorMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
    byType: [...typeMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

function ReportSection({ company, data, period }: { company: Company; data: ReportData; period: string }) {
  return (
    <section className="rpt-section" style={{ ["--co-accent" as string]: company.accent }}>
      <div className="rpt-section-hd">
        <div>
          <h2 className="rpt-section-name">{company.name}</h2>
          <p className="rpt-section-sub">{period}</p>
        </div>
        <div className="rpt-section-totals">
          <span>{data.orderCount} orders</span>
          <span>Profit {fmtMoney(data.profit)}</span>
        </div>
      </div>

      {data.orderCount === 0 ? (
        <div className="dash-empty">No orders for {company.name} in this period.</div>
      ) : (
        <>
          <div className="dash-stats-row rpt-kpis">
            <div className="stats-card s-active"><div className="stats-card-label">Active</div><div className="stats-card-value">{data.active}</div></div>
            <div className="stats-card s-completed"><div className="stats-card-label">Completed</div><div className="stats-card-value">{data.completed}</div></div>
            <div className="stats-card s-cost"><div className="stats-card-label">Total Cost</div><div className="stats-card-value">{fmtMoney(data.totalCost)}</div></div>
            <div className={`stats-card ${data.profit >= 0 ? "s-completed" : "s-pending"}`}><div className="stats-card-label">Profit</div><div className="stats-card-value">{fmtMoney(data.profit)}</div></div>
            <div className="stats-card s-gold"><div className="stats-card-label">Gold cast</div><div className="stats-card-value">{data.gold.toFixed(1)}<span className="stats-card-unit"> g</span></div></div>
            <div className="stats-card s-active"><div className="stats-card-label">Paid out</div><div className="stats-card-value">{fmtMoney(data.paidTotal)}</div></div>
            <div className={`stats-card ${data.outstanding > 0 ? "s-pending" : "s-completed"}`}>
              <div className="stats-card-label">Outstanding</div>
              <div className="stats-card-value">{fmtMoney(data.outstanding)}</div>
              <div className="stats-card-sub">cost incurred − payments recorded</div>
            </div>
          </div>

          <div className="rpt-tables">
            <div className="rpt-table-block">
              <div className="dash-row-head">By status</div>
              <table className="rpt-table">
                <thead><tr><th>Status</th><th>Orders</th><th>Cost</th></tr></thead>
                <tbody>
                  {data.byStatus.map((r) => (
                    <tr key={r.name}><td>{r.name}</td><td>{r.count}</td><td>{fmtMoney(r.cost)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rpt-table-block">
              <div className="dash-row-head">By vendor / setter</div>
              {data.byVendor.length === 0 ? (
                <div className="dash-empty">No vendor data.</div>
              ) : (
                <table className="rpt-table">
                  <thead><tr><th>Vendor</th><th>Orders</th><th>Total</th></tr></thead>
                  <tbody>
                    {data.byVendor.map((r) => (
                      <tr key={r.name}><td>{r.name}</td><td>{r.count}</td><td>{fmtMoney(r.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rpt-table-block">
              <div className="dash-row-head">By type</div>
              {data.byType.length === 0 ? (
                <div className="dash-empty">No product types.</div>
              ) : (
                <table className="rpt-table">
                  <thead><tr><th>Type</th><th>Orders</th></tr></thead>
                  <tbody>
                    {data.byType.map((r) => (
                      <tr key={r.name}><td>{r.name}</td><td>{r.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function reload() {
      try {
        const raw = window.localStorage.getItem("lgb_orders");
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) setAllOrders(parsed as Order[]);
      } catch {
        /* ignore */
      }
      try {
        const raw = window.localStorage.getItem("lgb_payments");
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) setPayments(parsed as Payment[]);
      } catch {
        /* ignore */
      }
    }
    reload();
    setCompanies(loadCompanies());
    setLoaded(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "lgb_orders" || e.key === "lgb_payments") reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("lgb:orders-updated", reload);
    window.addEventListener("lgb:payments-updated", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lgb:orders-updated", reload);
      window.removeEventListener("lgb:payments-updated", reload);
    };
  }, []);

  const period = useMemo(() => {
    if (!from && !to) return "All time";
    const f = from ? new Date(from + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "start";
    const t = to ? new Date(to + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "today";
    return `${f} — ${t}`;
  }, [from, to]);

  const groups = useMemo(() => {
    const sel = companyFilter === "all" ? companies : companies.filter((c) => c.id === companyFilter);
    return sel.map((c) => {
      const items = allOrders.filter((o) => (o.company || "lgb") === c.id && withinRange(o.createdAt, from, to));
      const pays = payments.filter((p) => (p.company || "lgb") === c.id && withinRange(p.paidOn, from, to));
      return { company: c, data: computeReport(items, pays) };
    });
  }, [companies, companyFilter, allOrders, payments, from, to]);

  return (
    <div className="lgb-page-stack max-w-6xl">
      <div className="page-hd lgb-page-hd-block rpt-page-hd">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Per-company summary · {period}</p>
        </div>
        <div className="rpt-controls">
          <div className="dash-series-toggle">
            <button type="button" className={`dash-toggle ${companyFilter === "all" ? "is-active" : ""}`} onClick={() => setCompanyFilter("all")}>All</button>
            {companies.map((c) => (
              <button key={c.id} type="button" className={`dash-toggle ${companyFilter === c.id ? "is-active" : ""}`} onClick={() => setCompanyFilter(c.id)}>{c.short || c.name}</button>
            ))}
          </div>
          <button type="button" className="btn btn-g btn-sm rpt-print-btn" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>

      <div className="rpt-daterange">
        <label className="payment-field"><span>From</span><input className="fc" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="payment-field"><span>To</span><input className="fc" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(from || to) ? (
          <button type="button" className="btn btn-g btn-sm" style={{ alignSelf: "end" }} onClick={() => { setFrom(""); setTo(""); }}>Clear</button>
        ) : null}
      </div>

      {!loaded ? (
        <p className="page-sub">Loading…</p>
      ) : (
        groups.map((g) => <ReportSection key={g.company.id} company={g.company} data={g.data} period={period} />)
      )}
    </div>
  );
}
