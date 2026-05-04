"use client";

import { useEffect, useState } from "react";
import { ExcelImportButton } from "@/components/ExcelImportButton";

export default function SettingsPage() {
  const [makers, setMakers] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [version, setVersion] = useState<string>("");
  const [geminiMsg, setGeminiMsg] = useState("");

  async function loadMakers() {
    try {
      const res = await fetch("/api/makers");
      if (!res.ok) {
        setMakers([]);
        return;
      }
      const text = await res.text();
      if (!text) {
        setMakers([]);
        return;
      }
      const data = JSON.parse(text) as { makers?: { id: string; name: string }[] };
      setMakers(data.makers ?? []);
    } catch {
      setMakers([]);
    }
  }

  useEffect(() => {
    void loadMakers();
    void (async () => {
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const v = (await res.json()) as { name?: string; version?: string };
        setVersion(`${v.name ?? "app"}@${v.version ?? "?"}`);
      } catch {
        setVersion("");
      }
    })();
    try {
      localStorage.removeItem("lgb_gemini_key");
    } catch {
      /* ignore */
    }
  }, []);

  async function testGemini() {
    setGeminiMsg("Testing…");
    const res = await fetch("/api/extraction/gemini-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; detail?: string; model?: string };
    if (j.ok) setGeminiMsg(`Gemini responded OK (model ${j.model ?? "?"}).`);
    else
      setGeminiMsg(
        `Failed: ${j.error ?? res.statusText}${j.detail ? ` — ${String(j.detail).slice(0, 160)}` : ""}`,
      );
  }

  async function exportExcel() {
    try {
      const raw = localStorage.getItem("lgb_orders");
      const orders = raw ? (JSON.parse(raw) as unknown[]) : [];
      const res = await fetch("/api/excel/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) {
        let msg = "Export failed";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) msg = data.error;
        } catch {
          const text = await res.text();
          if (text) msg = text;
        }
        alert(msg);
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const nameMatch = cd.match(/filename="([^"]+)"/i);
      const filename = nameMatch?.[1] ?? `jewelry-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function addMaker(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/makers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      let msg = res.statusText || "Failed";
      try {
        const text = await res.text();
        if (text) {
          const err = JSON.parse(text) as { error?: string };
          if (err.error) msg = err.error;
        }
      } catch {
        /* keep statusText */
      }
      alert(msg);
      return;
    }
    setName("");
    await loadMakers();
  }

  return (
    <div className="lgb-page-stack mx-auto max-w-2xl">
      <div className="lgb-page-hd-block">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">
          Makers appear as a dropdown on each order. Version is read from <code>package.json</code>.
        </p>
      </div>

      <section className="lgb-section">
        <h2>Excel workbook</h2>
        <p className="mt-1 text-xs lgb-muted">
          Export matches your conditional formatting rules for payments. Import runs a diff preview before merge.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void exportExcel()}
            className="btn btn-p inline-flex items-center gap-2 no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Excel
          </button>
          <ExcelImportButton variant="settings" />
        </div>
      </section>

      <section className="lgb-section">
        <h2>Version</h2>
        <p className="mt-2 font-mono text-sm text-[var(--text)]">{version || "…"}</p>
      </section>

      <section className="lgb-section">
        <h2>Makers</h2>
        <form onSubmit={addMaker} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Maker name"
            className="fc flex-1 text-sm"
            required
          />
          <button type="submit" className="btn btn-p shrink-0">
            Add
          </button>
        </form>
        <ul className="mt-4 space-y-1 text-sm text-[var(--text2)]">
          {makers.map((m) => (
            <li key={m.id} className="lgb-row flex justify-between px-2 py-1">
              <span>{m.name}</span>
              <button
                type="button"
                className="text-xs text-[var(--danger)] hover:underline"
                onClick={async () => {
                  if (!confirm(`Delete maker ${m.name}?`)) return;
                  await fetch(`/api/makers?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
                  await loadMakers();
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="lgb-section">
        <h2>Gemini (server only)</h2>
        <p className="mt-1 text-xs lgb-muted">
          API keys are not stored in the browser or sent from the client. Set{" "}
          <code className="font-mono">GEMINI_API_KEY</code> in your host (e.g. Vercel → Environment Variables). Get a
          key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
          .
        </p>
        <div className="mt-3">
          <button type="button" className="btn btn-p" onClick={() => void testGemini()}>
            Test server Gemini
          </button>
        </div>
        {geminiMsg ? <p className="mt-2 text-xs text-[var(--text2)]">{geminiMsg}</p> : null}
      </section>

      <section className="lgb-section text-sm lgb-muted">
        <h2>Image extraction</h2>
        <p className="mt-2 text-[var(--text2)]">
          <strong className="text-[var(--text)]">Printed invoices</strong>: optional Gemini vision when{" "}
          <code className="font-mono">GEMINI_API_KEY</code> is set on the server, plus Tesseract OCR — always review
          before commit. <strong className="text-[var(--text)]">Memos</strong>: no OCR — upload photos as references and
          use the structured stone form on each order.
        </p>
      </section>
    </div>
  );
}
