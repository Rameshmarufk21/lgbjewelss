import { loadCompanies } from "@/lib/companies";

type AnyOrder = { company?: string } & Record<string, unknown>;

async function fetchWorkbookBlob(orders: unknown[]): Promise<Blob> {
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
    throw new Error(msg);
  }
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "company";
}

/**
 * Export orders to Excel — one workbook PER company (LabGrownBox split into two
 * businesses). Each company's orders download as a separate .xlsx file.
 */
export async function exportOrdersExcel(): Promise<void> {
  if (typeof window === "undefined") return;

  const raw = window.localStorage.getItem("lgb_orders");
  const orders = (raw ? (JSON.parse(raw) as unknown[]) : []) as AnyOrder[];
  const companies = loadCompanies();
  const date = new Date().toISOString().slice(0, 10);

  const known = new Set(companies.map((c) => c.id));
  const groups = companies
    .map((c) => ({ name: c.name, items: orders.filter((o) => (o.company || "lgb") === c.id) }))
    .filter((g) => g.items.length > 0);

  // Any orders whose company isn't in the registry get their own file.
  const orphans = orders.filter((o) => !known.has(o.company || "lgb"));
  if (orphans.length) groups.push({ name: "Other", items: orphans });

  if (groups.length === 0) {
    // No orders at all — still hand back an (empty) workbook.
    triggerDownload(await fetchWorkbookBlob([]), `orders-${date}.xlsx`);
    return;
  }

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const blob = await fetchWorkbookBlob(g.items);
    triggerDownload(blob, `${slug(g.name)}-orders-${date}.xlsx`);
    // Give the browser a moment between downloads so it doesn't drop later files.
    if (i < groups.length - 1) await new Promise((r) => setTimeout(r, 500));
  }
}
