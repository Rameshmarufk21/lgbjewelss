import ExcelJS from "exceljs";
import { formatISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeProductFinancials } from "@/lib/aggregates";
import type { PaymentStatus } from "@/lib/types/status";

const PAID_FILL = "FFC6EFCE";
const PARTIAL_FILL = "FFFFF2CC";
const UNPAID_FILL = "FFFFC7CE";

export async function buildCatalogWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jewelry Ops Catalog";
  workbook.created = new Date();

  const productsSheet = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const productCols = [
    { header: "product_id", key: "product_id", width: 28 },
    { header: "display_name", key: "display_name", width: 22 },
    { header: "cad_filename_stem", key: "cad_filename_stem", width: 18 },
    { header: "status", key: "status", width: 12 },
    { header: "maker_name", key: "maker_name", width: 16 },
    { header: "client_name", key: "client_name", width: 18 },
    { header: "client_phone", key: "client_phone", width: 14 },
    { header: "client_email", key: "client_email", width: 22 },
    { header: "client_notes", key: "client_notes", width: 24 },
    { header: "sell_price", key: "sell_price", width: 12 },
    { header: "currency", key: "currency", width: 8 },
    { header: "notes", key: "notes", width: 28 },
    { header: "total_casting", key: "total_casting", width: 14 },
    { header: "total_stones", key: "total_stones", width: 14 },
    { header: "total_findings", key: "total_findings", width: 14 },
    { header: "grand_cost", key: "grand_cost", width: 14 },
    { header: "profit", key: "profit", width: 12 },
    { header: "invoice_payment_status", key: "invoice_payment_status", width: 22 },
    { header: "created_at_iso", key: "created_at_iso", width: 24 },
    { header: "updated_at_iso", key: "updated_at_iso", width: 24 },
  ] as const;

  productsSheet.columns = [...productCols];

  const headerRow = productsSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDDEBF7" },
  };

  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    include: { maker: true },
  });

  let rowIndex = 2;
  for (const p of products) {
    const fin = await computeProductFinancials(p.id);
    const sell = p.sellPriceCents != null ? p.sellPriceCents / 100 : null;
    const profitCents =
      p.sellPriceCents != null ? p.sellPriceCents - fin.grandCostCents : null;

    productsSheet.addRow({
      product_id: p.id,
      display_name: p.displayName ?? "",
      cad_filename_stem: p.cadFilenameStem ?? "",
      status: p.status,
      maker_name: p.maker?.name ?? "",
      client_name: p.clientName ?? "",
      client_phone: p.clientPhone ?? "",
      client_email: p.clientEmail ?? "",
      client_notes: p.clientNotes ?? "",
      sell_price: sell ?? "",
      currency: p.currency,
      notes: p.notes ?? "",
      total_casting: fin.totalCastingCents / 100,
      total_stones: fin.totalStonesCents / 100,
      total_findings: fin.totalFindingsCents / 100,
      grand_cost: fin.grandCostCents / 100,
      profit: profitCents != null ? profitCents / 100 : "",
      invoice_payment_status: fin.invoicePaymentStatus,
      created_at_iso: formatISO(p.createdAt),
      updated_at_iso: formatISO(p.updatedAt),
    });

    const excelRow = productsSheet.getRow(rowIndex);
    const pay = fin.invoicePaymentStatus as PaymentStatus;
    const fill =
      pay === "paid" ? PAID_FILL : pay === "partial" ? PARTIAL_FILL : UNPAID_FILL;
    excelRow.getCell("invoice_payment_status").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
    rowIndex++;
  }

  const invSheet = workbook.addWorksheet("Invoices", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  invSheet.columns = [
    { header: "product_id", key: "product_id", width: 28 },
    { header: "invoice_row_id", key: "invoice_row_id", width: 28 },
    { header: "vendor", key: "vendor", width: 18 },
    { header: "invoice_no", key: "invoice_no", width: 14 },
    { header: "invoice_date_iso", key: "invoice_date_iso", width: 22 },
    { header: "gold_weight_g", key: "gold_weight_g", width: 12 },
    { header: "gold_rate_per_g", key: "gold_rate_per_g", width: 14 },
    { header: "metal_cost", key: "metal_cost", width: 12 },
    { header: "labor_cost", key: "labor_cost", width: 12 },
    { header: "other_charges", key: "other_charges", width: 12 },
    { header: "total", key: "total", width: 12 },
    { header: "currency", key: "currency", width: 8 },
    { header: "payment_status", key: "payment_status", width: 14 },
    { header: "paid_amount", key: "paid_amount", width: 12 },
    { header: "paid_at_iso", key: "paid_at_iso", width: 22 },
    { header: "payment_method", key: "payment_method", width: 16 },
    { header: "notes", key: "notes", width: 24 },
  ];

  const invHeader = invSheet.getRow(1);
  invHeader.font = { bold: true };
  invHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDDEBF7" },
  };

  const invoices = await prisma.vendorInvoice.findMany({
    orderBy: { updatedAt: "desc" },
  });

  let invRow = 2;
  for (const inv of invoices) {
    invSheet.addRow({
      product_id: inv.productId ?? "",
      invoice_row_id: inv.id,
      vendor: inv.vendor,
      invoice_no: inv.invoiceNo,
      invoice_date_iso: inv.invoiceDate ? formatISO(inv.invoiceDate) : "",
      gold_weight_g: inv.goldWeightG ?? "",
      gold_rate_per_g: inv.goldRatePerG ?? "",
      metal_cost: inv.metalCostCents != null ? inv.metalCostCents / 100 : "",
      labor_cost: inv.laborCostCents != null ? inv.laborCostCents / 100 : "",
      other_charges: inv.otherChargesCents != null ? inv.otherChargesCents / 100 : "",
      total: inv.totalCents / 100,
      currency: inv.currency,
      payment_status: inv.paymentStatus,
      paid_amount: inv.paidAmountCents != null ? inv.paidAmountCents / 100 : "",
      paid_at_iso: inv.paidAt ? formatISO(inv.paidAt) : "",
      payment_method: inv.paymentMethod ?? "",
      notes: inv.notes ?? "",
    });
    const fill =
      inv.paymentStatus === "paid"
        ? PAID_FILL
        : inv.paymentStatus === "partial"
          ? PARTIAL_FILL
          : UNPAID_FILL;
    invSheet.getRow(invRow).getCell("payment_status").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
    invRow++;
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(new Uint8Array(buf as ArrayBuffer));
}
