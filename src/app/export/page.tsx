"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { ExcelImportButton } from "@/components/ExcelImportButton";
import { exportCompanyExcel } from "@/lib/client/exportOrdersExcel";
import { loadCompanies, type Company } from "@/lib/companies";

export default function ExportPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setCompanies(loadCompanies());
  }, []);

  async function download(c: Company) {
    setErr("");
    setBusy(c.id);
    try {
      await exportCompanyExcel(c.id, c.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="lgb-page-stack mx-auto max-w-2xl">
      <div className="lgb-page-hd-block">
        <h1 className="page-title">Export</h1>
      </div>

      <section className="lgb-section">
        <h2>Download Excel</h2>
        <p className="mt-1 text-xs lgb-muted">A separate workbook per company — orders, vendor invoices, and totals.</p>
        <div className="mt-4 export-grid">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              className="export-co-btn"
              style={{ ["--co-accent" as string]: c.accent }}
              onClick={() => void download(c)}
              disabled={!!busy}
            >
              <span className="export-co-dot" style={{ background: c.accent }} />
              <span className="export-co-name">{c.name}</span>
              <span className="export-co-action">
                <Download size={16} /> {busy === c.id ? "Preparing…" : "Download .xlsx"}
              </span>
            </button>
          ))}
        </div>
        {err ? <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{err}</p> : null}
      </section>

      <section className="lgb-section">
        <h2>Import Excel</h2>
        <p className="mt-1 text-xs lgb-muted">Import runs a diff preview before merging into your orders.</p>
        <div className="mt-3">
          <ExcelImportButton variant="settings" />
        </div>
      </section>
    </div>
  );
}
