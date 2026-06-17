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
  castGrams?: string | number;
  castDWT?: string | number;
  castTotal?: string | number;
  stoneTotal?: string | number;
  setter?: string;
  setTotal?: string | number;
  setDate?: string;
  imageUrl?: string;
  extras?: Array<{ desc?: string; cost?: string }>;
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

const fmtMoney = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const fmtDate = (d: string | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T12:00:00");
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function HistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("lgb_orders");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) setOrders(parsed as Order[]);
    } catch {
      /* empty / invalid storage — fine */
    }
    setLoaded(true);
  }, []);

  const completed = useMemo(
    () =>
      orders
        .filter((o) => (o.status || "") === "Completed")
        .sort((a, b) => {
          const ad = new Date(a.setDate || a.createdAt || 0).getTime();
          const bd = new Date(b.setDate || b.createdAt || 0).getTime();
          return bd - ad;
        }),
    [orders],
  );

  const totals = useMemo(() => {
    const totalCost = completed.reduce((a, o) => a + orderCost(o), 0);
    const totalGold = completed.reduce((a, o) => a + num(o.castGrams), 0);
    return { count: completed.length, totalCost, totalGold };
  }, [completed]);

  return (
    <div className="lgb-page-stack max-w-6xl">
      <div className="page-hd lgb-page-hd-block">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">
            {loaded
              ? `${totals.count} completed order${totals.count === 1 ? "" : "s"} · ${fmtMoney(
                  totals.totalCost,
                )} total cost · ${totals.totalGold.toFixed(2)} g gold cast`
              : "Loading completed orders…"}
          </p>
        </div>
      </div>

      {loaded && completed.length === 0 ? (
        <div className="dash-empty-card">
          <h2>No completed orders yet</h2>
          <p>
            When an order&apos;s status is set to <strong>Completed</strong> on the home page, it
            will appear here as part of the historical record.
          </p>
        </div>
      ) : (
        <div className="lgb-history-grid">
          {completed.map((o, index) => {
            const cost = orderCost(o);
            return (
              <article key={o.id ?? `order-${index}`} className="lgb-history-card">
                <div className="lgb-history-card-img">
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imageUrl} alt={o.styleCode ?? "Order image"} />
                  ) : (
                    <div className="lgb-history-card-placeholder">
                      <span>{(o.productType || "Item").toUpperCase()}</span>
                    </div>
                  )}
                  <span className="lgb-history-badge">Completed</span>
                </div>
                <div className="lgb-history-card-body">
                  <div className="lgb-history-card-head">
                    <div className="lgb-history-card-title">
                      {o.productType || "—"} · {o.styleCode || "—"}
                    </div>
                    <div className="lgb-history-card-id">{o.id || "—"}</div>
                  </div>
                  <dl className="lgb-history-card-meta">
                    <div>
                      <dt>Metal</dt>
                      <dd>{o.metal || "—"}</dd>
                    </div>
                    <div>
                      <dt>Placed by</dt>
                      <dd>{o.placedBy || "—"}</dd>
                    </div>
                    <div>
                      <dt>Cast vendor</dt>
                      <dd>{o.castVendor || "—"}</dd>
                    </div>
                    <div>
                      <dt>Setter</dt>
                      <dd>{o.setter || "—"}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{fmtDate(o.setDate || o.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Total cost</dt>
                      <dd className="lgb-history-card-cost">
                        {cost > 0 ? fmtMoney(cost) : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
