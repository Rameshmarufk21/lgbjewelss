"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCastingStatements,
  buildSetterStatements,
  buildDiamondStatements,
  fmtMoney,
  fmtStatementDate,
  loadOrdersFromStorage,
  loadPaymentsFromStorage,
  type VendorStatementGroup,
  type SupplierStatementGroup,
} from "@/lib/client/statementsFromOrders";
import { loadCompanies, type Company } from "@/lib/companies";

type Mode = "casting" | "setter" | "diamonds";

function VendorBlock({ group, mode, details }: { group: VendorStatementGroup; mode: Mode; details?: string }) {
  const hasInvoices = group.invoices.length > 0;
  const hasCardLines = group.cardLines.length > 0;

  const totalAmount = useMemo(() => {
    let sum = 0;
    group.invoices.forEach(inv => {
      inv.lines.forEach(line => {
        if (line.amount) sum += line.amount;
      });
    });
    group.cardLines.forEach(line => {
      if (line.amount) sum += line.amount;
    });
    return sum;
  }, [group]);

  return (
    <section className="stmt-vendor">
      <h3 className="stmt-vendor-name">{group.vendor}</h3>
      {details ? (
        <div className="stmt-vendor-payment" style={{ fontSize: "0.78rem", color: "var(--text2)", marginBottom: "12px", background: "var(--cream3)", padding: "6px 12px", borderRadius: "8px", display: "inline-block" }}>
          <strong>Payment Info:</strong> {details}
        </div>
      ) : null}

      {hasInvoices ? (
        <ol className="stmt-list">
          {group.invoices.map((inv, idx) =>
            inv.lines.map((line, lineIdx) => (
              <li key={`${inv.no}-${line.orderId || lineIdx}`} className="stmt-list-row">
                <span className="stmt-list-num">{lineIdx === 0 ? idx + 1 : ""}</span>
                <span className="stmt-list-inv">{lineIdx === 0 ? inv.no : ""}</span>
                <span className="stmt-list-date">{fmtStatementDate(line.date)}</span>
                <span className="stmt-list-product">{line.product}</span>
                <span className="stmt-list-amt">{fmtMoney(line.amount)}</span>
                <span className="stmt-list-status">{line.status || "—"}</span>
                <span className="stmt-list-medium">{line.medium || "—"}</span>
              </li>
            )),
          )}
        </ol>
      ) : null}

      {hasCardLines ? (
        <div className="stmt-card-section">
          {!hasInvoices ? (
            <p className="stmt-card-hint">
              No {mode === "casting" ? "casting" : "setter"} invoice # — from order cards
            </p>
          ) : null}
          <ol className="stmt-list stmt-list--card">
            {group.cardLines.map((line) => (
              <li key={line.orderId || line.product + line.date} className="stmt-list-row">
                <span className="stmt-list-num" />
                <span className="stmt-list-inv">—</span>
                <span className="stmt-list-date">{fmtStatementDate(line.date)}</span>
                <span className="stmt-list-product">{line.product}</span>
                <span className="stmt-list-amt">{fmtMoney(line.amount)}</span>
                <span className="stmt-list-status">{line.status || "—"}</span>
                <span className="stmt-list-medium">{line.medium || "—"}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="stmt-vendor-total" style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, padding: "10px 0", fontSize: "0.92rem", color: "var(--peacock)", borderTop: "1px solid var(--border)", marginTop: "8px" }}>
        Total: {fmtMoney(totalAmount)}
      </div>
    </section>
  );
}

function SupplierBlock({ group }: { group: SupplierStatementGroup }) {
  const totalCost = group.lines.reduce((sum, l) => sum + (l.cost || 0), 0);

  return (
    <section className="stmt-vendor">
      <h3 className="stmt-vendor-name">{group.supplier}</h3>
      <div className="stmt-list-head stmt-diamond-head" aria-hidden style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="stmt-list-inv">Order ID</span>
        <span className="stmt-list-date">Date</span>
        <span className="stmt-list-product">Details</span>
        <span className="stmt-list-amt">Carat</span>
        <span className="stmt-list-status">Cert</span>
        <span className="stmt-list-medium">Cost</span>
      </div>
      <ol className="stmt-list">
        {group.lines.map((line, idx) => (
          <li key={`${line.orderId}-${idx}`} className="stmt-list-row stmt-diamond-row">
            <span className="stmt-list-inv" style={{ fontWeight: 600 }}>{line.orderId}</span>
            <span className="stmt-list-date">{fmtStatementDate(line.date)}</span>
            <span className="stmt-list-product">{line.styleCode} · {line.shape} ({line.category})</span>
            <span className="stmt-list-amt" style={{ textAlign: "right" }}>{line.carat != null ? line.carat.toFixed(3) : "—"}</span>
            <span className="stmt-list-status">{line.cert || "—"}</span>
            <span className="stmt-list-medium" style={{ fontWeight: 600, color: "var(--text)" }}>{line.cost != null ? fmtMoney(line.cost) : "—"}</span>
          </li>
        ))}
      </ol>
      <div className="stmt-vendor-total" style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, padding: "10px 0", fontSize: "0.92rem", color: "var(--peacock)", borderTop: "1px solid var(--border)", marginTop: "8px" }}>
        Total Cost: {fmtMoney(totalCost)}
      </div>
    </section>
  );
}

export default function StatementsPage() {
  const [mode, setMode] = useState<Mode>("casting");
  const [loaded, setLoaded] = useState(false);
  const [casting, setCasting] = useState<VendorStatementGroup[]>([]);
  const [setter, setSetter] = useState<VendorStatementGroup[]>([]);
  const [diamonds, setDiamonds] = useState<SupplierStatementGroup[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [vendorDetails, setVendorDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    setCompanies(loadCompanies());
    setCompanyFilter("all");
    try {
      const raw = localStorage.getItem("lgb_vendor_details");
      if (raw) setVendorDetails(JSON.parse(raw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    function reload() {
      const all = loadOrdersFromStorage();
      const orders =
        companyFilter === "all" ? all : all.filter((o) => (o.company || "lgb") === companyFilter);
      const payments = loadPaymentsFromStorage();
      setCasting(buildCastingStatements(orders, payments));
      setSetter(buildSetterStatements(orders, payments));
      setDiamonds(buildDiamondStatements(orders));
      setLoaded(true);
    }
    reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lgb_payments" || e.key === "lgb_orders") reload();
      if (e.key === "lgb_vendor_details") {
        try {
          if (e.newValue) setVendorDetails(JSON.parse(e.newValue));
        } catch (_) {}
      }
    };
    const onUpdated = () => reload();
    const onVendorsUpdated = () => {
      try {
        const raw = localStorage.getItem("lgb_vendor_details");
        if (raw) setVendorDetails(JSON.parse(raw));
      } catch (_) {}
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("lgb:payments-updated", onUpdated);
    window.addEventListener("lgb:orders-updated", onUpdated);
    window.addEventListener("lgb:vendor-payments-updated", onVendorsUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lgb:payments-updated", onUpdated);
      window.removeEventListener("lgb:orders-updated", onUpdated);
      window.removeEventListener("lgb:vendor-payments-updated", onVendorsUpdated);
    };
  }, [companyFilter]);

  const groups = mode === "casting" ? casting : setter;

  const emptyHint = useMemo(() => {
    if (mode === "casting") {
      return "No casting vendors or invoices yet. Add cast vendor, invoice #, and total on your orders.";
    }
    if (mode === "setter") {
      return "No setter records yet. Add setter name and set total (or invoice #) on your orders.";
    }
    return "No diamond transactions found. Add stones with cost and supplier on your orders.";
  }, [mode]);

  return (
    <div className="lgb-page-stack max-w-5xl">
      <div className="page-hd lgb-page-hd-block stmt-page-hd">
        <div>
          <h1 className="page-title">Statements</h1>
          <p className="page-sub">
            {mode === "casting" ? "Casting house" : mode === "setter" ? "Setter" : "Diamond supplier"} statements ·{" "}
            {companyFilter === "all"
              ? "both companies"
              : companies.find((c) => c.id === companyFilter)?.name ?? "company"}
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

      <div className="stabs stmt-mode-tabs">
        <button
          type="button"
          className={`stab${mode === "casting" ? " active" : ""}`}
          onClick={() => setMode("casting")}
        >
          Casting
        </button>
        <button
          type="button"
          className={`stab${mode === "setter" ? " active" : ""}`}
          onClick={() => setMode("setter")}
        >
          Setter
        </button>
        <button
          type="button"
          className={`stab${mode === "diamonds" ? " active" : ""}`}
          onClick={() => setMode("diamonds")}
        >
          Diamonds
        </button>
      </div>

      {!loaded ? (
        <p className="page-sub">Loading…</p>
      ) : mode === "diamonds" ? (
        diamonds.length === 0 ? (
          <div className="dash-empty">{emptyHint}</div>
        ) : (
          <div className="stmt-vendor-stack">
            {diamonds.map((g) => (
              <SupplierBlock key={g.supplier} group={g} />
            ))}
          </div>
        )
      ) : (
        groups.length === 0 ? (
          <div className="dash-empty">{emptyHint}</div>
        ) : (
          <>
            <div className="stmt-list-head" aria-hidden style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="stmt-list-num" />
              <span className="stmt-list-inv">Invoice</span>
              <span className="stmt-list-date">Date</span>
              <span className="stmt-list-product">Product</span>
              <span className="stmt-list-amt">Amount</span>
              <span className="stmt-list-status">Status</span>
              <span className="stmt-list-medium">Medium</span>
            </div>
            <div className="stmt-vendor-stack">
              {groups.map((g) => (
                <VendorBlock key={g.vendor} group={g} mode={mode} details={vendorDetails[g.vendor]} />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
