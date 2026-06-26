import { loadCompanies } from "@/lib/companies";

type AnyOrder = { company?: string; placedBy?: string } & Record<string, unknown>;

function getCompanyForOrder(placedBy?: string, company?: string): string {
  const p = (placedBy || "").trim().toLowerCase();
  if (p === "sagar") return "sakk";
  if (p === "khushi" || p === "kunal" || p === "shweta") return "lgb";
  return company || "lgb";
}

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

/** Export ONE company's orders to its own Excel file. */
export async function exportCompanyExcel(companyId: string, companyName: string): Promise<void> {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem("lgb_orders");
  const all = (raw ? (JSON.parse(raw) as unknown[]) : []) as AnyOrder[];
  const items = all.filter((o) => getCompanyForOrder(o.placedBy, o.company) === companyId);
  const date = new Date().toISOString().slice(0, 10);
  const blob = await fetchWorkbookBlob(items);
  triggerDownload(blob, `${slug(companyName)}-orders-${date}.xlsx`);
}

/**
 * Import a previously-exported orders workbook into localStorage, tagging every
 * imported order with the chosen company. Rows are matched by `id`: existing
 * orders are updated in place, new ones are appended. Returns a small summary.
 */
export async function importCompanyExcel(
  file: File,
  companyId: string,
): Promise<{ created: number; updated: number }> {
  if (typeof window === "undefined") return { created: 0, updated: 0 };

  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/excel/import-orders", { method: "POST", body: fd });
  const data = (await res.json()) as { ok?: boolean; orders?: AnyOrder[]; error?: string };
  if (!res.ok || !data.ok || !Array.isArray(data.orders)) {
    throw new Error(data.error || "Import failed");
  }

  const raw = window.localStorage.getItem("lgb_orders");
  const existing = (raw ? (JSON.parse(raw) as unknown[]) : []) as AnyOrder[];
  const byId = new Map<string, number>();
  existing.forEach((o, i) => {
    const id = typeof o.id === "string" ? o.id : "";
    if (id) byId.set(id, i);
  });

  let created = 0;
  let updated = 0;
  for (const incoming of data.orders) {
    const orderCompany = getCompanyForOrder(incoming.placedBy, companyId);
    const tagged: AnyOrder = { ...incoming, company: orderCompany };
    const id = typeof incoming.id === "string" ? incoming.id : "";
    if (id && byId.has(id)) {
      const idx = byId.get(id)!;
      existing[idx] = { ...existing[idx], ...tagged };
      updated++;
    } else {
      existing.push(tagged);
      created++;
    }
  }

  window.localStorage.setItem("lgb_orders", JSON.stringify(existing));
  // Let other open pages (dashboard, history, etc.) pick up the change.
  window.dispatchEvent(new StorageEvent("storage", { key: "lgb_orders" }));
  return { created, updated };
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
    .map((c) => ({ name: c.name, items: orders.filter((o) => getCompanyForOrder(o.placedBy, o.company) === c.id) }))
    .filter((g) => g.items.length > 0);

  // Any orders whose company isn't in the registry get their own file.
  const orphans = orders.filter((o) => !known.has(getCompanyForOrder(o.placedBy, o.company)));
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
