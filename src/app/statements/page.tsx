"use client";

import { useEffect, useState } from "react";

type Matched = {
  token: string;
  invoice: {
    id: string;
    invoiceNo: string;
    vendor: string;
    totalCents: number;
    productId: string | null;
  };
};

type Batch = {
  id: string;
  name: string | null;
  totalMatchedCents: number;
  paymentStatus: string;
  paidAt: string | null;
  lines: { id: string; rawInvoiceNo: string | null }[];
};

export default function StatementsPage() {
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState<{
    matched: Matched[];
    missing: string[];
    sumCents: number;
  } | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  async function refreshBatches() {
    const res = await fetch("/api/statements");
    const data = await res.json();
    setBatches(data.batches ?? []);
  }

  useEffect(() => {
    void refreshBatches();
  }, []);

  async function runLookup() {
    const numbers = input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/statements/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers }),
    });
    setLookup(await res.json());
  }

  async function createBatch() {
    if (!lookup) return;
    const numbers = lookup.matched.map((m) => m.invoice.invoiceNo);
    const res = await fetch("/api/statements/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers, name: `Statement ${new Date().toLocaleDateString()}` }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed");
      return;
    }
    if (data.missing?.length) {
      alert(`Saved batch. Unmatched from request: ${data.missing.join(", ")}`);
    }
    await refreshBatches();
  }

  async function markPaid(batchId: string, totalMatchedCents: number) {
    const res = await fetch(`/api/statements/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentStatus: "paid",
        paidAt: new Date().toISOString(),
        paidAmountCents: totalMatchedCents,
        paymentMethod: "transfer",
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Failed");
      return;
    }
    await refreshBatches();
    alert("Marked paid; linked vendor invoices updated for Excel export colors.");
  }

  return (
    <div className="lgb-page-stack max-w-4xl">
      <div className="lgb-page-hd-block">
        <h1 className="page-title">Statement checker</h1>
        <p className="page-sub">
          Paste invoice numbers (space or comma separated). We sum matched vendor invoices and can record batch
          payments.
        </p>
      </div>

      <section className="lgb-section">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="INV-10023 INV-10024 …"
          className="fc w-full text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void runLookup()} className="btn btn-g">
            Lookup & sum
          </button>
          <button
            type="button"
            disabled={!lookup || lookup.matched.length === 0}
            onClick={() => void createBatch()}
            className="btn btn-p disabled:opacity-40"
          >
            Save as batch
          </button>
        </div>

        {lookup ? (
          <div className="mt-4 space-y-2 text-sm text-[var(--text2)]">
            <div>
              Sum: <span className="font-semibold text-[var(--peacock)]">{(lookup.sumCents / 100).toFixed(2)}</span>{" "}
              <span className="lgb-muted">({lookup.sumCents} cents)</span>
            </div>
            {lookup.missing.length ? (
              <div className="text-[var(--danger)]">Missing: {lookup.missing.join(", ")}</div>
            ) : null}
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {lookup.matched.map((m) => (
                <li key={m.invoice.id} className="flex justify-between gap-2 px-3 py-2">
                  <span>
                    {m.invoice.vendor} · {m.invoice.invoiceNo}
                  </span>
                  <span className="lgb-muted">
                    {(m.invoice.totalCents / 100).toFixed(2)}{" "}
                    {m.invoice.productId ? (
                      <a className="lgb-link" href={`/orders/${m.invoice.productId}`}>
                        open
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="lgb-section">
        <h2>Saved batches</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {batches.map((b) => (
            <li key={b.id} className="lgb-row flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <div className="font-medium text-[var(--text)]">{b.name ?? b.id}</div>
                <div className="text-xs lgb-muted">
                  {(b.totalMatchedCents / 100).toFixed(2)} · {b.paymentStatus} · {b.lines.length} lines
                </div>
              </div>
              <button
                type="button"
                className="btn btn-p btn-sm disabled:opacity-40"
                style={{ background: "var(--success)", color: "var(--cream)" }}
                disabled={b.paymentStatus === "paid"}
                onClick={() => void markPaid(b.id, b.totalMatchedCents)}
              >
                Mark paid
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
