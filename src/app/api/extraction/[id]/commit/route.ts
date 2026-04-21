import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractedInvoiceSchema, extractedMemoSchema } from "@/lib/schema/canonical";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await prisma.extractionJob.findUnique({
    where: { id },
    include: { asset: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const payload = body && typeof body === "object" && body.payload ? body.payload : body;

  if (job.kind === "memo") {
    const memo = extractedMemoSchema.parse(payload);
    const productId = job.productId ?? job.asset.productId;
    const memoNotes = [memo.stones_summary, memo.notes].filter(Boolean).join("\n\n") || null;
    await prisma.stoneAssignment.create({
      data: {
        productId,
        memoId: memo.memo_id,
        supplier: memo.supplier,
        carat: memo.carat_total ?? null,
        shape: null,
        costCents: memo.cost != null ? Math.round(memo.cost * 100) : null,
        returnDate: memo.return_date ? new Date(memo.return_date) : null,
        notes: memoNotes,
        assetId: job.assetId,
      },
    });
    await prisma.extractionJob.update({
      where: { id },
      data: { status: "completed" },
    });
    return NextResponse.json({ ok: true, type: "memo" });
  }

  const inv = extractedInvoiceSchema.parse(payload);
  const productId = job.productId ?? job.asset.productId;
  const vendor = String(inv.vendor ?? "Unknown");
  const invoiceNo = String(inv.invoice_no ?? "UNKNOWN");
  const totalCents =
    inv.total != null ? Math.round(inv.total * 100) : Math.round((inv.metal_cost ?? 0) * 100);

  const created = await prisma.vendorInvoice.create({
    data: {
      productId,
      assetId: job.assetId,
      vendor,
      invoiceNo,
      invoiceDate: inv.invoice_date ? new Date(inv.invoice_date) : null,
      currency: inv.currency ?? "USD",
      goldWeightG: inv.gold_weight_g ?? null,
      goldRatePerG: inv.gold_rate_per_g ?? null,
      metalCostCents: inv.metal_cost != null ? Math.round(inv.metal_cost * 100) : null,
      laborCostCents: inv.labor_cost != null ? Math.round(inv.labor_cost * 100) : null,
      otherChargesCents: inv.other_charges != null ? Math.round(inv.other_charges * 100) : null,
      totalCents,
      lineItemsJson: inv.line_items ? JSON.stringify(inv.line_items) : null,
      paymentStatus: "unpaid",
    },
  });

  await prisma.extractionJob.update({
    where: { id },
    data: { status: "completed" },
  });

  return NextResponse.json({ ok: true, type: "invoice", invoice: created });
}
