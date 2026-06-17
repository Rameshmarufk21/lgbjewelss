"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCastingStatements,
  buildSetterStatements,
  fmtMoney,
  fmtStatementDate,
  loadOrdersFromStorage,
  loadPaymentsFromStorage,
  type VendorStatementGroup,
} from "@/lib/client/statementsFromOrders";
import { loadCompanies, type Company } from "@/lib/companies";

type Mode = "casting" | "setter";

function VendorBlock({ group, mode }: { group: VendorStatementGroup; mode: Mode }) {
  const hasInvoices = group.invoices.length > 0;
  const hasCardLines = group.cardLines.length > 0;

  return (
    <section className="stmt-vendor">
      <h3 className="stmt-vendor-name">{group.vendor}</h3>

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
    </section>
  );
}

export default function StatementsPage() {
  const [mode, setMode] = useState<Mode>("casting");
  const [loaded, setLoaded] = useState(false);
  const [casting, setCasting] = useState<VendorStatementGroup[]>([]);
  const [setter, setSetter] = useState<VendorStatementGroup[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  useEffect(() => {
    setCompanies(loadCompanies());
    setCompanyFilter("all");
  }, []);

  useEffect(() => {
    function reload() {
      const all = loadOrdersFromStorage();
      const orders =
        companyFilter === "all" ? all : all.filter((o) => (o.company || "lgb") === companyFilter);
      const payments = loadPaymentsFromStorage();
      setCasting(buildCastingStatements(orders, payments));
      setSetter(buildSetterStatements(orders, payments));
      setLoaded(true);
    }
    reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lgb_payments" || e.key === "lgb_orders") reload();
    };
    const onUpdated = () => reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener("lgb:payments-updated", onUpdated);
    window.addEventListener("lgb:orders-updated", onUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lgb:payments-updated", onUpdated);
      window.removeEventListener("lgb:orders-updated", onUpdated);
    };
  }, [companyFilter]);

  const groups = mode === "casting" ? casting : setter;

  const emptyHint = useMemo(() => {
    if (mode === "casting") {
      return "No casting vendors or invoices yet. Add cast vendor, invoice #, and total on your orders.";
    }
    return "No setter records yet. Add setter name and set total (or invoice #) on your orders.";
  }, [mode]);

  return (
    <div className="lgb-page-stack max-w-5xl">
      <div className="page-hd lgb-page-hd-block stmt-page-hd">
        <div>
          <h1 className="page-title">Statements</h1>
          <p className="page-sub">
            {mode === "casting" ? "Casting house" : "Setter"} invoices ·{" "}
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
      </div>

      {!loaded ? (
        <p className="page-sub">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="dash-empty">{emptyHint}</div>
      ) : (
        <>
          <div className="stmt-list-head" aria-hidden>
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
              <VendorBlock key={g.vendor} group={g} mode={mode} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
