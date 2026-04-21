import { NextResponse } from "next/server";
import {
  applyInvoiceDiffs,
  applyProductDiffs,
  type InvoiceDiff,
  type ProductDiff,
} from "@/lib/excel/importWorkbook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const productDiffs = Array.isArray(body.productDiffs)
    ? (body.productDiffs as ProductDiff[])
    : [];
  const invoiceDiffs = Array.isArray(body.invoiceDiffs)
    ? (body.invoiceDiffs as InvoiceDiff[])
    : [];

  const p = await applyProductDiffs(productDiffs);
  const i = await applyInvoiceDiffs(invoiceDiffs);
  return NextResponse.json({ ok: true, appliedProducts: p.applied, appliedInvoices: i.applied });
}
