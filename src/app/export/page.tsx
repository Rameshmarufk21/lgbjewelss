"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { exportCompanyExcel, importCompanyExcel } from "@/lib/client/exportOrdersExcel";
import { loadCompanies, type Company } from "@/lib/companies";

export default function ExportPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [importing, setImporting] = useState<string>("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setCompanies(loadCompanies());
  }, []);

  async function download(c: Company) {
    setErr("");
    setMsg("");
    setBusy(c.id);
    try {
      await exportCompanyExcel(c.id, c.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy("");
    }
  }

  async function onImportFile(c: Company, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    setImporting(c.id);
    try {
      const { created, updated } = await importCompanyExcel(file, c.id);
      setMsg(`${c.name}: imported ${created} new, updated ${updated} order${created + updated === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting("");
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
      </section>

      <section className="lgb-section">
        <h2>Import Excel</h2>
        <p className="mt-1 text-xs lgb-muted">
          Pick which company to import into. Rows matched by order ID are updated; new rows are added.
        </p>
        <div className="mt-4 export-grid">
          {companies.map((c) => (
            <div key={c.id}>
              <input
                ref={(el) => {
                  fileRefs.current[c.id] = el;
                }}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => void onImportFile(c, e)}
              />
              <button
                type="button"
                className="export-co-btn"
                style={{ ["--co-accent" as string]: c.accent }}
                onClick={() => fileRefs.current[c.id]?.click()}
                disabled={!!importing}
              >
                <span className="export-co-dot" style={{ background: c.accent }} />
                <span className="export-co-name">{c.name}</span>
                <span className="export-co-action">
                  <Upload size={16} /> {importing === c.id ? "Importing…" : "Import .xlsx"}
                </span>
              </button>
            </div>
          ))}
        </div>
        {msg ? <p className="mt-3 text-xs" style={{ color: "var(--peacock)" }}>{msg}</p> : null}
        {err ? <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{err}</p> : null}
      </section>
    </div>
  );
}
