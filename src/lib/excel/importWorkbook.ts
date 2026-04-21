import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { isPaymentStatus, isProductStatus } from "@/lib/types/status";

export type ProductImportRow = {
  rowNumber: number;
  product_id: string | null;
  display_name: string | null;
  cad_filename_stem: string | null;
  status: string | null;
  maker_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_notes: string | null;
  sell_price: number | null;
  currency: string | null;
  notes: string | null;
};

export type ProductDiff = {
  rowNumber: number;
  productId: string | null;
  action: "create" | "update" | "skip";
  changes: Record<string, { from: unknown; to: unknown }>;
  warnings: string[];
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function parseProductsFromWorkbook(buffer: Uint8Array): Promise<ProductImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const sheet = wb.getWorksheet("Products");
  if (!sheet) throw new Error('Missing sheet "Products"');

  const header = sheet.getRow(1).values as unknown[];
  const idx = (name: string) =>
    header.findIndex((h) => String(h ?? "").trim().toLowerCase() === name.toLowerCase());

  const col = {
    product_id: idx("product_id"),
    display_name: idx("display_name"),
    cad_filename_stem: idx("cad_filename_stem"),
    status: idx("status"),
    maker_name: idx("maker_name"),
    client_name: idx("client_name"),
    client_phone: idx("client_phone"),
    client_email: idx("client_email"),
    client_notes: idx("client_notes"),
    sell_price: idx("sell_price"),
    currency: idx("currency"),
    notes: idx("notes"),
  };

  if (col.product_id <= 0) throw new Error("Products sheet must include product_id column");

  const rows: ProductImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = (c: number) => (c > 0 ? row.getCell(c).value : null);
    const pid = str(v(col.product_id));
    if (!pid && !str(v(col.display_name)) && !str(v(col.cad_filename_stem))) return;

    rows.push({
      rowNumber,
      product_id: pid,
      display_name: str(v(col.display_name)),
      cad_filename_stem: str(v(col.cad_filename_stem)),
      status: str(v(col.status)),
      maker_name: str(v(col.maker_name)),
      client_name: str(v(col.client_name)),
      client_phone: str(v(col.client_phone)),
      client_email: str(v(col.client_email)),
      client_notes: str(v(col.client_notes)),
      sell_price: num(v(col.sell_price)),
      currency: str(v(col.currency)),
      notes: str(v(col.notes)),
    });
  });

  return rows;
}

export async function diffProductImportRows(rows: ProductImportRow[]): Promise<ProductDiff[]> {
  const diffs: ProductDiff[] = [];

  for (const r of rows) {
    const warnings: string[] = [];
    if (r.status && !isProductStatus(r.status)) {
      warnings.push(`Invalid status "${r.status}" — will skip status field`);
    }

    if (!r.product_id) {
      diffs.push({
        rowNumber: r.rowNumber,
        productId: null,
        action: "create",
        changes: {
          display_name: { from: null, to: r.display_name },
          cad_filename_stem: { from: null, to: r.cad_filename_stem },
          status: { from: null, to: r.status ?? "cad_sent" },
          maker_name: { from: null, to: r.maker_name },
          client_name: { from: null, to: r.client_name },
          client_phone: { from: null, to: r.client_phone },
          client_email: { from: null, to: r.client_email },
          client_notes: { from: null, to: r.client_notes },
          sell_price_cents: { from: null, to: r.sell_price != null ? Math.round(r.sell_price * 100) : null },
          currency: { from: null, to: r.currency ?? "USD" },
          notes: { from: null, to: r.notes },
        },
        warnings,
      });
      continue;
    }

    const existing = await prisma.product.findUnique({
      where: { id: r.product_id },
      include: { maker: true },
    });
    if (!existing) {
      warnings.push(`Unknown product_id ${r.product_id} — row skipped`);
      diffs.push({
        rowNumber: r.rowNumber,
        productId: r.product_id,
        action: "skip",
        changes: {},
        warnings,
      });
      continue;
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const push = (k: string, from: unknown, to: unknown) => {
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    };

    push("display_name", existing.displayName, r.display_name);
    push("cad_filename_stem", existing.cadFilenameStem, r.cad_filename_stem);
    if (r.status && isProductStatus(r.status)) push("status", existing.status, r.status);
    push("maker_name", existing.maker?.name ?? null, r.maker_name);
    push("client_name", existing.clientName, r.client_name);
    push("client_phone", existing.clientPhone, r.client_phone);
    push("client_email", existing.clientEmail, r.client_email);
    push("client_notes", existing.clientNotes, r.client_notes);
    const sellCents =
      r.sell_price != null ? Math.round(r.sell_price * 100) : existing.sellPriceCents;
    push("sell_price_cents", existing.sellPriceCents, sellCents);
    push("currency", existing.currency, r.currency ?? existing.currency);
    push("notes", existing.notes, r.notes);

    diffs.push({
      rowNumber: r.rowNumber,
      productId: r.product_id,
      action: Object.keys(changes).length ? "update" : "skip",
      changes,
      warnings,
    });
  }

  return diffs;
}

export async function applyProductDiffs(diffs: ProductDiff[]): Promise<{ applied: number }> {
  let applied = 0;
  for (const d of diffs) {
    if (d.action === "skip") continue;

    if (d.action === "create") {
      let makerId: string | null = null;
      const name = d.changes.maker_name?.to as string | null;
      if (name) {
        const maker = await prisma.maker.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        makerId = maker.id;
      }
      const status =
        d.changes.status?.to && isProductStatus(String(d.changes.status.to))
          ? String(d.changes.status.to)
          : "cad_sent";
      await prisma.product.create({
        data: {
          displayName: (d.changes.display_name?.to as string | null) ?? null,
          cadFilenameStem: (d.changes.cad_filename_stem?.to as string | null) ?? null,
          status,
          makerId,
          clientName: (d.changes.client_name?.to as string | null) ?? null,
          clientPhone: (d.changes.client_phone?.to as string | null) ?? null,
          clientEmail: (d.changes.client_email?.to as string | null) ?? null,
          clientNotes: (d.changes.client_notes?.to as string | null) ?? null,
          sellPriceCents: (d.changes.sell_price_cents?.to as number | null) ?? null,
          currency: (d.changes.currency?.to as string | null) ?? "USD",
          notes: (d.changes.notes?.to as string | null) ?? null,
        },
      });
      applied++;
      continue;
    }

    if (d.action === "update" && d.productId) {
      let makerId: string | null | undefined = undefined;
      if ("maker_name" in d.changes) {
        const name = d.changes.maker_name?.to as string | null;
        if (name) {
          const maker = await prisma.maker.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          makerId = maker.id;
        } else {
          makerId = null;
        }
      }

      const data: Record<string, unknown> = {};
      const set = (k: string, v: unknown) => {
        if (v !== undefined) data[k] = v;
      };
      if ("display_name" in d.changes) set("displayName", d.changes.display_name?.to);
      if ("cad_filename_stem" in d.changes) set("cadFilenameStem", d.changes.cad_filename_stem?.to);
      if ("status" in d.changes) {
        const st = d.changes.status?.to;
        if (st && isProductStatus(String(st))) set("status", st);
      }
      if (makerId !== undefined) set("makerId", makerId);
      if ("client_name" in d.changes) set("clientName", d.changes.client_name?.to);
      if ("client_phone" in d.changes) set("clientPhone", d.changes.client_phone?.to);
      if ("client_email" in d.changes) set("clientEmail", d.changes.client_email?.to);
      if ("client_notes" in d.changes) set("clientNotes", d.changes.client_notes?.to);
      if ("sell_price_cents" in d.changes) set("sellPriceCents", d.changes.sell_price_cents?.to);
      if ("currency" in d.changes) set("currency", d.changes.currency?.to);
      if ("notes" in d.changes) set("notes", d.changes.notes?.to);

      if (Object.keys(data).length) {
        await prisma.product.update({ where: { id: d.productId }, data: data as object });
        applied++;
      }
    }
  }

  return { applied };
}

export type InvoiceImportRow = {
  rowNumber: number;
  product_id: string | null;
  invoice_row_id: string | null;
  vendor: string | null;
  invoice_no: string | null;
  invoice_date_iso: string | null;
  gold_weight_g: number | null;
  gold_rate_per_g: number | null;
  metal_cost: number | null;
  labor_cost: number | null;
  other_charges: number | null;
  total: number | null;
  currency: string | null;
  payment_status: string | null;
  paid_amount: number | null;
  paid_at_iso: string | null;
  payment_method: string | null;
  notes: string | null;
};

export async function parseInvoicesFromWorkbook(buffer: Uint8Array): Promise<InvoiceImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const sheet = wb.getWorksheet("Invoices");
  if (!sheet) return [];

  const header = sheet.getRow(1).values as unknown[];
  const idx = (name: string) =>
    header.findIndex((h) => String(h ?? "").trim().toLowerCase() === name.toLowerCase());

  const col = {
    product_id: idx("product_id"),
    invoice_row_id: idx("invoice_row_id"),
    vendor: idx("vendor"),
    invoice_no: idx("invoice_no"),
    invoice_date_iso: idx("invoice_date_iso"),
    gold_weight_g: idx("gold_weight_g"),
    gold_rate_per_g: idx("gold_rate_per_g"),
    metal_cost: idx("metal_cost"),
    labor_cost: idx("labor_cost"),
    other_charges: idx("other_charges"),
    total: idx("total"),
    currency: idx("currency"),
    payment_status: idx("payment_status"),
    paid_amount: idx("paid_amount"),
    paid_at_iso: idx("paid_at_iso"),
    payment_method: idx("payment_method"),
    notes: idx("notes"),
  };

  const rows: InvoiceImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = (c: number) => (c > 0 ? row.getCell(c).value : null);
    const vendor = str(v(col.vendor));
    const invoice_no = str(v(col.invoice_no));
    if (!vendor && !invoice_no) return;
    rows.push({
      rowNumber,
      product_id: str(v(col.product_id)),
      invoice_row_id: str(v(col.invoice_row_id)),
      vendor,
      invoice_no,
      invoice_date_iso: str(v(col.invoice_date_iso)),
      gold_weight_g: num(v(col.gold_weight_g)),
      gold_rate_per_g: num(v(col.gold_rate_per_g)),
      metal_cost: num(v(col.metal_cost)),
      labor_cost: num(v(col.labor_cost)),
      other_charges: num(v(col.other_charges)),
      total: num(v(col.total)),
      currency: str(v(col.currency)),
      payment_status: str(v(col.payment_status)),
      paid_amount: num(v(col.paid_amount)),
      paid_at_iso: str(v(col.paid_at_iso)),
      payment_method: str(v(col.payment_method)),
      notes: str(v(col.notes)),
    });
  });
  return rows;
}

export type InvoiceDiff = {
  rowNumber: number;
  action: "create" | "update" | "skip";
  invoiceId: string | null;
  productId: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  warnings: string[];
};

export async function diffInvoiceImportRows(rows: InvoiceImportRow[]): Promise<InvoiceDiff[]> {
  const out: InvoiceDiff[] = [];
  for (const r of rows) {
    const warnings: string[] = [];
    if (r.payment_status && !isPaymentStatus(r.payment_status)) {
      warnings.push(`Invalid payment_status "${r.payment_status}"`);
    }
    if (!r.product_id) {
      out.push({
        rowNumber: r.rowNumber,
        action: "skip",
        invoiceId: null,
        productId: null,
        changes: {},
        warnings: [...warnings, "Missing product_id"],
      });
      continue;
    }
    const product = await prisma.product.findUnique({ where: { id: r.product_id } });
    if (!product) {
      out.push({
        rowNumber: r.rowNumber,
        action: "skip",
        invoiceId: null,
        productId: r.product_id,
        changes: {},
        warnings: [...warnings, "Unknown product_id"],
      });
      continue;
    }

    if (r.invoice_row_id) {
      const inv = await prisma.vendorInvoice.findUnique({ where: { id: r.invoice_row_id } });
      if (!inv) {
        out.push({
          rowNumber: r.rowNumber,
          action: "skip",
          invoiceId: r.invoice_row_id,
          productId: r.product_id,
          changes: {},
          warnings: [...warnings, "Unknown invoice_row_id"],
        });
        continue;
      }
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const push = (k: string, from: unknown, to: unknown) => {
        if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
      };
      push("vendor", inv.vendor, r.vendor ?? inv.vendor);
      push("invoice_no", inv.invoiceNo, r.invoice_no ?? inv.invoiceNo);
      push("gold_weight_g", inv.goldWeightG, r.gold_weight_g);
      push("gold_rate_per_g", inv.goldRatePerG, r.gold_rate_per_g);
      push(
        "metal_cost_cents",
        inv.metalCostCents,
        r.metal_cost != null ? Math.round(r.metal_cost * 100) : inv.metalCostCents,
      );
      push(
        "labor_cost_cents",
        inv.laborCostCents,
        r.labor_cost != null ? Math.round(r.labor_cost * 100) : inv.laborCostCents,
      );
      push(
        "other_charges_cents",
        inv.otherChargesCents,
        r.other_charges != null ? Math.round(r.other_charges * 100) : inv.otherChargesCents,
      );
      push(
        "total_cents",
        inv.totalCents,
        r.total != null ? Math.round(r.total * 100) : inv.totalCents,
      );
      push("currency", inv.currency, r.currency ?? inv.currency);
      if (r.payment_status && isPaymentStatus(r.payment_status)) {
        push("payment_status", inv.paymentStatus, r.payment_status);
      }
      push(
        "paid_amount_cents",
        inv.paidAmountCents,
        r.paid_amount != null ? Math.round(r.paid_amount * 100) : inv.paidAmountCents,
      );
      push("payment_method", inv.paymentMethod, r.payment_method);
      push("notes", inv.notes, r.notes);

      out.push({
        rowNumber: r.rowNumber,
        action: Object.keys(changes).length ? "update" : "skip",
        invoiceId: r.invoice_row_id,
        productId: r.product_id,
        changes,
        warnings,
      });
      continue;
    }

    if (!r.vendor || !r.invoice_no || r.total == null) {
      out.push({
        rowNumber: r.rowNumber,
        action: "skip",
        invoiceId: null,
        productId: r.product_id,
        changes: {},
        warnings: [...warnings, "New invoice requires vendor, invoice_no, total"],
      });
      continue;
    }

    out.push({
      rowNumber: r.rowNumber,
      action: "create",
      invoiceId: null,
      productId: r.product_id,
      changes: {
        vendor: { from: null, to: r.vendor },
        invoice_no: { from: null, to: r.invoice_no },
        total_cents: { from: null, to: Math.round(r.total * 100) },
        currency: { from: null, to: r.currency ?? "USD" },
        payment_status: {
          from: null,
          to:
            r.payment_status && isPaymentStatus(r.payment_status) ? r.payment_status : "unpaid",
        },
      },
      warnings,
    });
  }
  return out;
}

export async function applyInvoiceDiffs(diffs: InvoiceDiff[]): Promise<{ applied: number }> {
  let applied = 0;
  for (const d of diffs) {
    if (d.action === "skip") continue;
    if (d.action === "create" && d.productId) {
      await prisma.vendorInvoice.create({
        data: {
          productId: d.productId,
          vendor: String(d.changes.vendor?.to),
          invoiceNo: String(d.changes.invoice_no?.to),
          totalCents: Number(d.changes.total_cents?.to),
          currency: String(d.changes.currency?.to ?? "USD"),
          paymentStatus: String(d.changes.payment_status?.to ?? "unpaid"),
        },
      });
      applied++;
    }
    if (d.action === "update" && d.invoiceId) {
      const data: Record<string, unknown> = {};
      const c = d.changes;
      if (c.vendor) data.vendor = c.vendor.to;
      if (c.invoice_no) data.invoiceNo = c.invoice_no.to;
      if (c.gold_weight_g) data.goldWeightG = c.gold_weight_g.to;
      if (c.gold_rate_per_g) data.goldRatePerG = c.gold_rate_per_g.to;
      if (c.metal_cost_cents) data.metalCostCents = c.metal_cost_cents.to;
      if (c.labor_cost_cents) data.laborCostCents = c.labor_cost_cents.to;
      if (c.other_charges_cents) data.otherChargesCents = c.other_charges_cents.to;
      if (c.total_cents) data.totalCents = c.total_cents.to;
      if (c.currency) data.currency = c.currency.to;
      if (c.payment_status) data.paymentStatus = c.payment_status.to;
      if (c.paid_amount_cents) data.paidAmountCents = c.paid_amount_cents.to;
      if (c.payment_method) data.paymentMethod = c.payment_method.to;
      if (c.notes) data.notes = c.notes.to;
      if (Object.keys(data).length) {
        await prisma.vendorInvoice.update({ where: { id: d.invoiceId }, data: data as object });
        applied++;
      }
    }
  }
  return { applied };
}
