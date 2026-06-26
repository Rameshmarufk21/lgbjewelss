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
  company?: string;
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
  setJob?: string;
  stones?: any[];
  extras?: any[];
  notes?: string;

  // Legacy fallbacks
  stoneShape?: string;
  stoneColor?: string;
  stoneMM?: string | number;
  stonePcs?: string | number;
  stoneCt?: string | number;
  stoneTotal?: string | number;
  stoneCert?: string;
};

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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

async function buildCompanyProjectSheets(
  wb: ExcelJS.Workbook,
  orders: LocalOrder[],
  companyId: string,
  projectsSheetName: string,
  pendingSheetName: string,
  paymentSheetName: string,
  paymentDescHeaderName: string
) {
  const wsProj = wb.addWorksheet(projectsSheetName);
  wsProj.columns = [
    { width: 18 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 15 },
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 15 }, { width: 15 }
  ];

  const coOrders = orders.filter((o) => {
    const p = (o.placedBy || "").trim().toLowerCase();
    if (p === "sagar") return companyId === "sakk";
    if (p === "khushi" || p === "kunal" || p === "shweta") return companyId === "lgb";
    return (o.company || "lgb") === companyId;
  });
  
  let rStart = 8; // Start blocks at row 8 like in jewelry.xlsx PROJECTS sheet
  
  coOrders.forEach((o, index) => {
    const projIdx = index + 1;
    
    // Row 1: Date / Total header
    const r1 = wsProj.getRow(rStart);
    r1.getCell(3).value = "Date";
    r1.getCell(3).font = { bold: true };
    r1.getCell(10).value = "Total";
    r1.getCell(10).font = { bold: true };
    
    // Row 2: Project Number, index, Date
    const r2 = wsProj.getRow(rStart + 1);
    r2.getCell(1).value = "Project Number";
    r2.getCell(1).font = { bold: true };
    r2.getCell(2).value = projIdx;
    r2.getCell(3).value = o.createdAt ? new Date(o.createdAt) : "";
    
    // Row 4: Sales Person
    const r4 = wsProj.getRow(rStart + 3);
    r4.getCell(1).value = "Sales Person";
    r4.getCell(1).font = { bold: true };
    r4.getCell(2).value = o.placedBy || "";
    
    // Row 6: Client Name
    const r6 = wsProj.getRow(rStart + 5);
    r6.getCell(1).value = "Client Name";
    r6.getCell(1).font = { bold: true };
    r6.getCell(2).value = o.notes && o.notes.startsWith("Client: ") ? o.notes.replace("Client: ", "") : "";
    
    // Row 8: CAD Header
    const r8 = wsProj.getRow(rStart + 7);
    r8.getCell(1).value = "CAD Guy name";
    r8.getCell(1).font = { bold: true };
    r8.getCell(2).value = "Cost";
    r8.getCell(2).font = { bold: true };
    r8.getCell(3).value = "File Name";
    r8.getCell(3).font = { bold: true };
    
    // Row 9: CAD Data
    const r9 = wsProj.getRow(rStart + 8);
    r9.getCell(3).value = o.styleCode || "";
    
    // Row 11: Casting Header
    const r11 = wsProj.getRow(rStart + 10);
    const castHeaders = ["Casting Company", "Date", "invoice number", "metal", "gw", "price per gram", "print fee", "total ", "discount ", "final price"];
    castHeaders.forEach((h, cIdx) => {
      const cell = r11.getCell(cIdx + 1);
      cell.value = h;
      cell.font = { bold: true };
    });
    
    // Row 12: Casting Data
    const r12 = wsProj.getRow(rStart + 11);
    r12.getCell(1).value = o.castVendor || "";
    r12.getCell(2).value = o.castDate ? new Date(o.castDate) : "";
    r12.getCell(3).value = o.castInvoice || "";
    r12.getCell(4).value = o.metal || "";
    r12.getCell(5).value = o.castGrams ? num(o.castGrams) : "";
    r12.getCell(5).numFmt = "0.00";
    
    // Price per gram formula
    r12.getCell(6).value = { formula: `=H${rStart + 12}/E${rStart + 12}`, result: undefined };
    r12.getCell(6).numFmt = "$#,##0.00";
    
    r12.getCell(7).value = o.castPrint ? num(o.castPrint) : "";
    r12.getCell(7).numFmt = "$#,##0.00";
    
    r12.getCell(8).value = o.castTotal ? num(o.castTotal) : "";
    r12.getCell(8).numFmt = "$#,##0.00";
    
    r12.getCell(9).value = 0;
    r12.getCell(9).numFmt = "$#,##0.00";
    
    r12.getCell(10).value = { formula: `=H${rStart + 12}-I${rStart + 12}`, result: undefined };
    r12.getCell(10).numFmt = "$#,##0.00";
    
    // Row 14: Diamond Header
    const r14 = wsProj.getRow(rStart + 13);
    const stoneHeaders = ["Diamond ", "shape", "Size", "Pcs", "tcw", "ppct", "color", "tp", null, "total"];
    stoneHeaders.forEach((h, cIdx) => {
      if (h) {
        const cell = r14.getCell(cIdx + 1);
        cell.value = h;
        cell.font = { bold: true };
      }
    });
    
    // Stones and Extras rows
    const stoneRows = o.stones || [];
    const extraRows = o.extras || [];
    let stoneOffset = 0;
    
    if (stoneRows.length === 0 && extraRows.length === 0 && (o.stoneShape || o.stoneCt)) {
      // Create single stone row from legacy fields
      const sRow = wsProj.getRow(rStart + 14 + stoneOffset);
      sRow.getCell(2).value = o.stoneShape || "";
      sRow.getCell(3).value = o.stoneMM || "";
      sRow.getCell(4).value = o.stonePcs ? num(o.stonePcs) : "";
      sRow.getCell(5).value = o.stoneCt ? num(o.stoneCt) : "";
      sRow.getCell(5).numFmt = "0.000";
      sRow.getCell(7).value = o.stoneColor || "";
      sRow.getCell(8).value = o.stoneTotal ? num(o.stoneTotal) : "";
      sRow.getCell(8).numFmt = "$#,##0.00";
      sRow.getCell(10).value = { formula: `=H${rStart + 15 + stoneOffset}`, result: undefined };
      sRow.getCell(10).numFmt = "$#,##0.00";
      stoneOffset++;
    } else {
      stoneRows.forEach((s: any) => {
        const sRow = wsProj.getRow(rStart + 14 + stoneOffset);
        sRow.getCell(1).value = s.category === "melee" ? "Melee" : "Diamond";
        sRow.getCell(2).value = s.shape || "";
        sRow.getCell(3).value = s.size || s.sizeMm || s.stoneMM || "";
        sRow.getCell(4).value = s.pcs ? num(s.pcs) : "";
        sRow.getCell(5).value = s.carat ? num(s.carat) : "";
        sRow.getCell(5).numFmt = "0.000";
        sRow.getCell(7).value = s.colorGrade || "";
        sRow.getCell(8).value = s.cost ? num(s.cost) : "";
        sRow.getCell(8).numFmt = "$#,##0.00";
        sRow.getCell(10).value = { formula: `=H${rStart + 15 + stoneOffset}`, result: undefined };
        sRow.getCell(10).numFmt = "$#,##0.00";
        stoneOffset++;
      });
      
      extraRows.forEach((e: any) => {
        const sRow = wsProj.getRow(rStart + 14 + stoneOffset);
        sRow.getCell(1).value = e.desc || "";
        sRow.getCell(8).value = e.cost ? num(e.cost) : "";
        sRow.getCell(8).numFmt = "$#,##0.00";
        sRow.getCell(10).value = { formula: `=H${rStart + 15 + stoneOffset}`, result: undefined };
        sRow.getCell(10).numFmt = "$#,##0.00";
        stoneOffset++;
      });
    }
    
    if (stoneOffset === 0) {
      const sRow = wsProj.getRow(rStart + 14 + stoneOffset);
      sRow.getCell(10).value = "";
      stoneOffset++;
    }
    
    // Setter Header Row
    const setterHdrRow = rStart + 14 + stoneOffset;
    const rSetHdr = wsProj.getRow(setterHdrRow);
    const setterHeaders = ["Setter ", "Name", "Invoice Number", "Note", "Date", "Received Date", null, null, null, "Cost"];
    setterHeaders.forEach((h, cIdx) => {
      if (h) {
        const cell = rSetHdr.getCell(cIdx + 1);
        cell.value = h;
        cell.font = { bold: true };
      }
    });
    
    // Setter Data Row
    const rSetData = wsProj.getRow(setterHdrRow + 1);
    rSetData.getCell(2).value = o.setter || "";
    rSetData.getCell(3).value = o.setInvoice || "";
    rSetData.getCell(4).value = o.setJob || "";
    rSetData.getCell(5).value = o.setDate ? new Date(o.setDate) : "";
    rSetData.getCell(10).value = o.setPrice ? num(o.setPrice) : "";
    rSetData.getCell(10).numFmt = "$#,##0.00";
    
    // Final Cost Header
    const rFinalHdr = wsProj.getRow(setterHdrRow + 3);
    const finalHeaders = ["Final Cost", null, "CASTING", "DIAMOND", "SETTER", null, null, null, null, "TOTAL"];
    finalHeaders.forEach((h, cIdx) => {
      if (h) {
        const cell = rFinalHdr.getCell(cIdx + 1);
        cell.value = h;
        cell.font = { bold: true };
      }
    });
    
    // Final Cost Data Row
    const rFinalData = wsProj.getRow(setterHdrRow + 4);
    rFinalData.getCell(3).value = { formula: `=J${rStart + 12}`, result: undefined };
    rFinalData.getCell(3).numFmt = "$#,##0.00";
    
    // Sum formula for stones + extras
    rFinalData.getCell(4).value = {
      formula: `=SUM(J${rStart + 15}:J${rStart + 15 + stoneOffset - 1})`,
      result: undefined
    };
    rFinalData.getCell(4).numFmt = "$#,##0.00";
    
    rFinalData.getCell(5).value = { formula: `=J${setterHdrRow + 2}`, result: undefined };
    rFinalData.getCell(5).numFmt = "$#,##0.00";
    
    rFinalData.getCell(10).value = {
      formula: `=C${setterHdrRow + 5}+D${setterHdrRow + 5}+E${setterHdrRow + 5}`,
      result: undefined
    };
    rFinalData.getCell(10).font = { bold: true };
    rFinalData.getCell(10).numFmt = "$#,##0.00";
    
    // Delivery Date row
    const rDelivery = wsProj.getRow(setterHdrRow + 6);
    rDelivery.getCell(1).value = "Delivery Date";
    rDelivery.getCell(1).font = { bold: true };
    rDelivery.getCell(2).value = ""; // Empty placeholder
    
    rStart = setterHdrRow + 9;
  });
  
  // Populate PENDING sheet
  const wsPending = wb.addWorksheet(pendingSheetName);
  wsPending.columns = [
    { header: "Date ", key: "date", width: 14 },
    { header: "Invoice No ", key: "invoice_no", width: 14 },
    { header: "Description", key: "desc", width: 18 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Discount", key: "discount", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Date Paid", key: "date_paid", width: 14 }
  ];
  
  wsPending.insertRow(1, ["Jewelry"]);
  wsPending.insertRow(2, [companyId === "sakk" ? "SAKK MTA" : "MTA"]);
  wsPending.getRow(1).font = { bold: true };
  wsPending.getRow(2).font = { bold: true };
  wsPending.getRow(3).font = { bold: true };
  
  let pIdx = 4;
  coOrders.forEach((o) => {
    if (o.castVendor || o.castInvoice || num(o.castTotal) > 0) {
      const isPaid = (o.status ?? "").toLowerCase() === "completed";
      wsPending.addRow({
        date: o.castDate ? new Date(o.castDate) : "",
        invoice_no: o.castInvoice || "",
        desc: o.styleCode || "",
        amount: num(o.castTotal) || "",
        discount: 0,
        total: { formula: `=D${pIdx}-E${pIdx}`, result: undefined },
        status: isPaid ? "Paid" : "Pending",
        date_paid: isPaid ? (o.castDate ? new Date(o.castDate) : "") : ""
      });
      wsPending.getRow(pIdx).getCell("amount").numFmt = "$#,##0.00";
      wsPending.getRow(pIdx).getCell("discount").numFmt = "$#,##0.00";
      wsPending.getRow(pIdx).getCell("total").numFmt = "$#,##0.00";
      pIdx++;
    }
  });

  // Populate PAYMENT sheet
  const wsPayment = wb.addWorksheet(paymentSheetName);
  wsPayment.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: paymentDescHeaderName, key: "desc", width: 22 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Note", key: "note", width: 24 }
  ];
  
  wsPayment.insertRow(1, ["PAYMENTS"]);
  wsPayment.getRow(1).font = { bold: true };
  wsPayment.getRow(2).font = { bold: true };
  
  let payIdx = 3;
  coOrders.forEach((o) => {
    if (o.setter || num(o.setPrice) > 0) {
      wsPayment.addRow({
        date: o.setDate ? new Date(o.setDate) : "",
        desc: o.setter || "",
        amount: num(o.setPrice) || "",
        note: o.setInvoice ? `Invoice: ${o.setInvoice}` : (o.setJob || "")
      });
      wsPayment.getRow(payIdx).getCell("amount").numFmt = "$#,##0.00";
      payIdx++;
    }
  });
}

export async function buildCatalogWorkbookFromOrders(orders: LocalOrder[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LabGrownBox";
  workbook.created = new Date();

  // LGB Sheets
  await buildCompanyProjectSheets(
    workbook,
    orders,
    "lgb",
    "PROJECTS",
    "PENDING",
    "LGB_Jewelry Payment",
    "Setter"
  );

  // SAKK Sheets
  await buildCompanyProjectSheets(
    workbook,
    orders,
    "sakk",
    "SAKK PROJECTS",
    "SAKK",
    "SAKK_Jewelry_Payment",
    "Description"
  );

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(new Uint8Array(buf as ArrayBuffer));
}
