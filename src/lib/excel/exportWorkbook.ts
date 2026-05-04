import ExcelJS from "exceljs";
import { formatISO } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeProductFinancials } from "@/lib/aggregates";
import type { PaymentStatus } from "@/lib/types/status";

const PAID_FILL = "FFC6EFCE";
const PARTIAL_FILL = "FFFFF2CC";
const UNPAID_FILL = "FFFFC7CE";

type LocalOrder = {
  id?: string;
  styleCode?: string;
  productType?: string;
  metal?: string;
  size?: string;
  status?: string;
  placedBy?: string;
  createdAt?: string;
  castVendor?: string;
  castInvoice?: string;
  castDate?: string;
  castDWT?: string | number;
  castGrams?: string | number;
  castPrint?: string | number;
  castTotal?: string | number;
  setter?: string;
  setInvoice?: string;
  setDate?: string;
  setPrice?: string | number;
  setLabor?: string | number;
  setLaser?: string | number;
  setTotal?: string | number;
  stoneShape?: string;
  stoneMM?: string | number;
  stonePcs?: string | number;
  stoneCt?: string | number;
  stoneTotal?: string | number;
  notes?: string;
};

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function invoiceStatus(order: LocalOrder): PaymentStatus {
  const cast = num(order.castTotal);
  const set = num(order.setTotal);
  const total = cast + set;
  if (total <= 0) return "unpaid";
  if ((order.status ?? "").toLowerCase() === "completed") return "paid";
  return "partial";
}

function vendorBucketName(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "UNASSIGNED";
  if (v.includes("mta")) return "MTA";
  if (v.includes("carat")) return "CARAT";
  if (v.includes("mc")) return "MC";
  if (v.includes("victor")) return "VICTOR";
  if (v.includes("jymp")) return "JYMP";
  if (v.includes("edwin")) return "EDWIN";
  return "OTHER";
}

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

export async function buildCatalogWorkbookFromOrders(orders: LocalOrder[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LabGrownBox";
  workbook.created = new Date();

  const cardsSheet = workbook.addWorksheet("Cards", { views: [{ state: "frozen", ySplit: 1 }] });
  cardsSheet.columns = [
    { header: "order_id", key: "order_id", width: 14 },
    { header: "style_code", key: "style_code", width: 16 },
    { header: "product_type", key: "product_type", width: 14 },
    { header: "status", key: "status", width: 14 },
    { header: "placed_by", key: "placed_by", width: 14 },
    { header: "created_at", key: "created_at", width: 14 },
    { header: "metal", key: "metal", width: 16 },
    { header: "size", key: "size", width: 12 },
    { header: "cast_vendor", key: "cast_vendor", width: 20 },
    { header: "cast_invoice", key: "cast_invoice", width: 14 },
    { header: "cast_date", key: "cast_date", width: 14 },
    { header: "cast_total", key: "cast_total", width: 12 },
    { header: "setter", key: "setter", width: 14 },
    { header: "set_invoice", key: "set_invoice", width: 14 },
    { header: "set_date", key: "set_date", width: 14 },
    { header: "set_total", key: "set_total", width: 12 },
    { header: "stone_shape", key: "stone_shape", width: 16 },
    { header: "stone_size_mm", key: "stone_size_mm", width: 14 },
    { header: "stone_pcs", key: "stone_pcs", width: 12 },
    { header: "stone_ct", key: "stone_ct", width: 12 },
    { header: "stone_total", key: "stone_total", width: 12 },
    { header: "grand_total", key: "grand_total", width: 12 },
    { header: "notes", key: "notes", width: 30 },
  ];
  cardsSheet.getRow(1).font = { bold: true };

  const allInvoiceRows: Array<{
    vendor: string;
    bucket: string;
    orderId: string;
    styleCode: string;
    productType: string;
    invoiceNo: string;
    invoiceDate: string;
    amount: number;
    paymentStatus: PaymentStatus;
    source: "casting" | "setting";
  }> = [];

  for (const o of orders) {
    const castTotal = num(o.castTotal);
    const setTotal = num(o.setTotal);
    const stoneTotal = num(o.stoneTotal);
    const grandTotal = castTotal + setTotal + stoneTotal;
    const payStatus = invoiceStatus(o);

    cardsSheet.addRow({
      order_id: o.id ?? "",
      style_code: o.styleCode ?? "",
      product_type: o.productType ?? "",
      status: o.status ?? "",
      placed_by: o.placedBy ?? "",
      created_at: o.createdAt ?? "",
      metal: o.metal ?? "",
      size: o.size ?? "",
      cast_vendor: o.castVendor ?? "",
      cast_invoice: o.castInvoice ?? "",
      cast_date: o.castDate ?? "",
      cast_total: castTotal || "",
      setter: o.setter ?? "",
      set_invoice: o.setInvoice ?? "",
      set_date: o.setDate ?? "",
      set_total: setTotal || "",
      stone_shape: o.stoneShape ?? "",
      stone_size_mm: o.stoneMM ?? "",
      stone_pcs: o.stonePcs ?? "",
      stone_ct: o.stoneCt ?? "",
      stone_total: stoneTotal || "",
      grand_total: grandTotal || "",
      notes: o.notes ?? "",
    });

    if (castTotal > 0 || (o.castInvoice ?? "").trim()) {
      allInvoiceRows.push({
        vendor: o.castVendor ?? "",
        bucket: vendorBucketName(o.castVendor ?? ""),
        orderId: o.id ?? "",
        styleCode: o.styleCode ?? "",
        productType: o.productType ?? "",
        invoiceNo: o.castInvoice ?? "",
        invoiceDate: o.castDate ?? "",
        amount: castTotal,
        paymentStatus: payStatus,
        source: "casting",
      });
    }
    if (setTotal > 0 || (o.setInvoice ?? "").trim()) {
      allInvoiceRows.push({
        vendor: o.setter ?? "",
        bucket: vendorBucketName(o.setter ?? ""),
        orderId: o.id ?? "",
        styleCode: o.styleCode ?? "",
        productType: o.productType ?? "",
        invoiceNo: o.setInvoice ?? "",
        invoiceDate: o.setDate ?? "",
        amount: setTotal,
        paymentStatus: payStatus,
        source: "setting",
      });
    }
  }

  const invoicesSheet = workbook.addWorksheet("Invoices", { views: [{ state: "frozen", ySplit: 1 }] });
  invoicesSheet.columns = [
    { header: "vendor", key: "vendor", width: 18 },
    { header: "order_id", key: "order_id", width: 14 },
    { header: "style_code", key: "style_code", width: 16 },
    { header: "product_type", key: "product_type", width: 14 },
    { header: "source", key: "source", width: 10 },
    { header: "invoice_no", key: "invoice_no", width: 14 },
    { header: "invoice_date", key: "invoice_date", width: 14 },
    { header: "amount", key: "amount", width: 12 },
    { header: "payment_status", key: "payment_status", width: 14 },
  ];
  invoicesSheet.getRow(1).font = { bold: true };

  allInvoiceRows.forEach((r, idx) => {
    invoicesSheet.addRow({
      vendor: r.vendor,
      order_id: r.orderId,
      style_code: r.styleCode,
      product_type: r.productType,
      source: r.source,
      invoice_no: r.invoiceNo,
      invoice_date: r.invoiceDate,
      amount: r.amount || "",
      payment_status: r.paymentStatus,
    });
    const fill = r.paymentStatus === "paid" ? PAID_FILL : r.paymentStatus === "partial" ? PARTIAL_FILL : UNPAID_FILL;
    invoicesSheet.getRow(idx + 2).getCell("payment_status").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
  });

  const buckets = new Map<string, typeof allInvoiceRows>();
  for (const row of allInvoiceRows) {
    const prev = buckets.get(row.bucket) ?? [];
    prev.push(row);
    buckets.set(row.bucket, prev);
  }
  const bucketOrder = ["MTA", "CARAT", "MC", "VICTOR", "JYMP", "EDWIN", "OTHER", "UNASSIGNED"];
  for (const bucket of bucketOrder) {
    const rows = buckets.get(bucket);
    if (!rows?.length) continue;
    const ws = workbook.addWorksheet(bucket, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [...invoicesSheet.columns];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r, idx) => {
      ws.addRow({
        vendor: r.vendor,
        order_id: r.orderId,
        style_code: r.styleCode,
        product_type: r.productType,
        source: r.source,
        invoice_no: r.invoiceNo,
        invoice_date: r.invoiceDate,
        amount: r.amount || "",
        payment_status: r.paymentStatus,
      });
      const fill =
        r.paymentStatus === "paid" ? PAID_FILL : r.paymentStatus === "partial" ? PARTIAL_FILL : UNPAID_FILL;
      ws.getRow(idx + 2).getCell("payment_status").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    });
  }

  const dashboard = workbook.addWorksheet("Dashboard");
  dashboard.columns = [
    { header: "metric", key: "metric", width: 26 },
    { header: "value", key: "value", width: 20 },
  ];
  dashboard.getRow(1).font = { bold: true };
  const totalOrders = orders.length;
  const totalCast = orders.reduce((a, o) => a + num(o.castTotal), 0);
  const totalSet = orders.reduce((a, o) => a + num(o.setTotal), 0);
  const totalStone = orders.reduce((a, o) => a + num(o.stoneTotal), 0);
  const totalGrand = totalCast + totalSet + totalStone;
  dashboard.addRows([
    { metric: "Total cards", value: totalOrders },
    { metric: "Casting total", value: totalCast },
    { metric: "Setting total", value: totalSet },
    { metric: "Stone total", value: totalStone },
    { metric: "Grand total", value: totalGrand },
    { metric: "Invoices exported", value: allInvoiceRows.length },
  ]);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(new Uint8Array(buf as ArrayBuffer));
}
