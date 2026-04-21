"use client";

import { useRef, useState } from "react";

type DiffResponse = {
  productDiffs: unknown[];
  invoiceDiffs: unknown[];
  summary: Record<string, number>;
};

type Props = {
  /** `settings`: full-width secondary button for the Settings page */
  variant?: "settings";
};

export function ExcelImportButton({ variant = "settings" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/excel/import", { method: "POST", body: fd });
      const data = (await res.json()) as DiffResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const msg = `Import preview:\nProducts create ${data.summary.productCreates}, update ${data.summary.productUpdates}\nInvoices create ${data.summary.invoiceCreates}, update ${data.summary.invoiceUpdates}\n\nApply changes to database?`;
      if (typeof window !== "undefined" && window.confirm(msg)) {
        const apply = await fetch("/api/excel/import/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productDiffs: data.productDiffs,
            invoiceDiffs: data.invoiceDiffs,
          }),
        });
        const applied = await apply.json();
        if (!apply.ok) throw new Error(applied.error ?? "Apply failed");
        window.alert(
          `Applied: ${applied.appliedProducts ?? 0} product rows, ${applied.appliedInvoices ?? 0} invoice rows`,
        );
        window.location.reload();
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const btnClass = variant === "settings" ? "btn btn-g w-full justify-center sm:w-auto" : "btn btn-g";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={onFile}
        disabled={busy}
      />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={btnClass}>
        {busy ? "Working…" : "Import Excel (.xlsx)"}
      </button>
    </>
  );
}
