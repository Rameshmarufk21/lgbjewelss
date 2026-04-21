import { NextResponse } from "next/server";
import {
  diffInvoiceImportRows,
  diffProductImportRows,
  parseInvoicesFromWorkbook,
  parseProductsFromWorkbook,
} from "@/lib/excel/importWorkbook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const buffer = new Uint8Array(await file.arrayBuffer());

  const productRows = await parseProductsFromWorkbook(buffer);
  const invoiceRows = await parseInvoicesFromWorkbook(buffer);
  const productDiffs = await diffProductImportRows(productRows);
  const invoiceDiffs = await diffInvoiceImportRows(invoiceRows);

  return NextResponse.json({
    productDiffs,
    invoiceDiffs,
    summary: {
      productRows: productRows.length,
      invoiceRows: invoiceRows.length,
      productCreates: productDiffs.filter((d) => d.action === "create").length,
      productUpdates: productDiffs.filter((d) => d.action === "update").length,
      invoiceCreates: invoiceDiffs.filter((d) => d.action === "create").length,
      invoiceUpdates: invoiceDiffs.filter((d) => d.action === "update").length,
    },
  });
}
