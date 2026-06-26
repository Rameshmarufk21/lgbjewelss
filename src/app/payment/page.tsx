"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCompanies, loadActiveCompany, type Company } from "@/lib/companies";

const STORAGE_KEY = "lgb_payments";

type PaymentCategory = "casting" | "setter" | "stones" | "other";

type Payment = {
  id: string;
  company?: string;
  paidTo: string;
  category: PaymentCategory;
  amount: number;
  paidOn: string;
  orderId?: string;
  note?: string;
  createdAt: string;
};

type Order = { id?: string; company?: string; styleCode?: string; castVendor?: string; setter?: string };

const CATEGORIES: { value: PaymentCategory; label: string }[] = [
  { value: "casting", label: "Casting" },
  { value: "setter", label: "Setter" },
  { value: "stones", label: "Stones / supplier" },
  { value: "other", label: "Other" },
];

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  const dt = new Date(d.includes("T") ? d : d + "T12:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function loadPayments(): Payment[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Payment[]) : [];
  } catch {
    return [];
  }
}

function savePayments(list: Payment[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("lgb:payments-updated"));
}

export default function PaymentPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const [paidTo, setPaidTo] = useState("");
  const [category, setCategory] = useState<PaymentCategory>("casting");
  const [company, setCompany] = useState("lgb");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    function reload() {
      setPayments(loadPayments());
      try {
        const raw = window.localStorage.getItem("lgb_orders");
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) setOrders(parsed as Order[]);
      } catch {
        /* ignore */
      }
    }
    reload();
    const list = loadCompanies();
    setCompanies(list);
    const active = loadActiveCompany();
    setCompanyFilter("all");
    setCompany(active && active !== "all" ? active : list[0]?.id || "lgb");
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

  // Payments scoped to the selected company (legacy untagged → lgb).
  const visiblePayments = useMemo(
    () => (companyFilter === "all" ? payments : payments.filter((p) => (p.company || "lgb") === companyFilter)),
    [payments, companyFilter],
  );

  const totals = useMemo(() => {
    const byCat: Record<PaymentCategory, number> = {
      casting: 0,
      setter: 0,
      stones: 0,
      other: 0,
    };
    let all = 0;
    visiblePayments.forEach((p) => {
      all += p.amount;
      byCat[p.category] += p.amount;
    });
    return { all, byCat };
  }, [visiblePayments]);

  const [formError, setFormError] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!paidTo.trim() || !Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter vendor name and a valid amount.");
      return;
    }
    setFormError("");

    const entry: Payment = {
      id: `PAY-${Date.now()}`,
      company,
      paidTo: paidTo.trim(),
      category,
      amount: amt,
      paidOn,
      orderId: orderId.trim() || undefined,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...payments];
    setPayments(next);
    savePayments(next);
    setPaidTo("");
    setAmount("");
    setNote("");
    setOrderId("");
  }

  function removePayment(id: string) {
    if (!confirm("Remove this payment record?")) return;
    const next = payments.filter((p) => p.id !== id);
    setPayments(next);
    savePayments(next);
  }

  return (
    <div className="lgb-page-stack max-w-3xl">
      <div className="page-hd lgb-page-hd-block">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">
            {companyFilter === "all"
              ? "Both companies"
              : companies.find((c) => c.id === companyFilter)?.name ?? "Company"}{" "}
            · amounts paid to casting houses, setters, stone suppliers, and others.
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

      <div className="dash-stats-row" style={{ marginBottom: 20 }}>
        <div className="stats-card s-cost">
          <div className="stats-card-label">Total recorded</div>
          <div className="stats-card-value">{fmtMoney(totals.all)}</div>
          <div className="stats-card-sub">{visiblePayments.length} payment{visiblePayments.length === 1 ? "" : "s"}</div>
        </div>
        <div className="stats-card s-gold">
          <div className="stats-card-label">Casting</div>
          <div className="stats-card-value">{fmtMoney(totals.byCat.casting)}</div>
        </div>
        <div className="stats-card s-active">
          <div className="stats-card-label">Setters</div>
          <div className="stats-card-value">{fmtMoney(totals.byCat.setter)}</div>
        </div>
        <div className="stats-card s-pending">
          <div className="stats-card-label">Stones / other</div>
          <div className="stats-card-value">{fmtMoney(totals.byCat.stones + totals.byCat.other)}</div>
        </div>
      </div>

      <form className="payment-form-card" onSubmit={onSubmit}>
        <h2 className="payment-form-title">Log a payment</h2>
        {formError ? <p className="payment-form-error">{formError}</p> : null}
        <div className="fg2">
          <label className="payment-field">
            <span>Company</span>
            <select className="fc" value={company} onChange={(e) => setCompany(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="payment-field">
            <span>Paid to (vendor / person)</span>
            <input className="fc" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} required />
          </label>
          <label className="payment-field">
            <span>Category</span>
            <select className="fc" value={category} onChange={(e) => setCategory(e.target.value as PaymentCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="payment-field">
            <span>Amount (USD)</span>
            <input
              className="fc"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="payment-field">
            <span>Date paid</span>
            <input className="fc" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
          </label>
          <label className="payment-field">
            <span>Order (optional)</span>
            <select className="fc" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">— None —</option>
              {orders
                .filter((o) => (o.company || "lgb") === company)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.styleCode || o.id} · {o.id}
                  </option>
                ))}
            </select>
          </label>
          <label className="payment-field" style={{ gridColumn: "1 / -1" }}>
            <span>Note (optional)</span>
            <input className="fc" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice #, check, etc." />
          </label>
        </div>
        <button type="submit" className="btn btn-p" style={{ marginTop: 14 }}>
          Save payment
        </button>
      </form>

      <div className="dash-row-head" style={{ marginTop: 28 }}>
        Recent payments
      </div>
      {!loaded ? (
        <p className="page-sub">Loading…</p>
      ) : visiblePayments.length === 0 ? (
        <div className="dash-empty">No payments logged yet.</div>
      ) : (
        <ul className="payment-list">
          {visiblePayments.map((p) => (
            <li key={p.id} className="payment-list-item">
              <div>
                <div className="payment-list-vendor">{p.paidTo}</div>
                <div className="payment-list-meta">
                  {CATEGORIES.find((c) => c.value === p.category)?.label}
                  {p.orderId ? ` · ${p.orderId}` : ""}
                  {" · "}
                  {fmtDate(p.paidOn)}
                  {p.note ? ` · ${p.note}` : ""}
                </div>
              </div>
              <div className="payment-list-right">
                <span className="payment-list-amt">{fmtMoney(p.amount)}</span>
                <button type="button" className="btn btn-g btn-sm" onClick={() => removePayment(p.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
