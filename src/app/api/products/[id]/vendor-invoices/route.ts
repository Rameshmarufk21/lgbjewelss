import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: productId } = await ctx.params;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vendor = String(body.vendor ?? "").trim();
  const invoiceNo = String(body.invoiceNo ?? "").trim();
  if (!vendor || !invoiceNo) {
    return NextResponse.json({ error: "vendor and invoiceNo required" }, { status: 400 });
  }

  const totalCents =
    typeof body.totalCents === "number"
      ? Math.round(body.totalCents)
      : typeof body.total === "number"
        ? Math.round(body.total * 100)
        : null;
  if (totalCents == null || !Number.isFinite(totalCents)) {
    return NextResponse.json({ error: "total or totalCents required" }, { status: 400 });
  }

  const inv = await prisma.vendorInvoice.create({
    data: {
      productId,
      assetId: typeof body.assetId === "string" ? body.assetId : null,
      vendor,
      invoiceNo,
      invoiceDate: body.invoiceDate ? new Date(String(body.invoiceDate)) : null,
      currency: typeof body.currency === "string" ? body.currency : "USD",
      goldWeightG: typeof body.goldWeightG === "number" ? body.goldWeightG : null,
      goldRatePerG: typeof body.goldRatePerG === "number" ? body.goldRatePerG : null,
      metalCostCents:
        body.metalCostCents != null
          ? Math.round(Number(body.metalCostCents))
          : body.metalCost != null
            ? Math.round(Number(body.metalCost) * 100)
            : null,
      laborCostCents:
        body.laborCostCents != null
          ? Math.round(Number(body.laborCostCents))
          : body.laborCost != null
            ? Math.round(Number(body.laborCost) * 100)
            : null,
      otherChargesCents:
        body.otherChargesCents != null
          ? Math.round(Number(body.otherChargesCents))
          : body.otherCharges != null
            ? Math.round(Number(body.otherCharges) * 100)
            : null,
      totalCents,
      lineItemsJson:
        typeof body.lineItemsJson === "string"
          ? body.lineItemsJson
          : body.lineItems
            ? JSON.stringify(body.lineItems)
            : null,
      paymentStatus: typeof body.paymentStatus === "string" ? body.paymentStatus : "unpaid",
      notes: typeof body.notes === "string" ? body.notes : null,
    },
  });

  return NextResponse.json({ invoice: inv });
}
