import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const maybe = (k: string, v: unknown) => {
    if (v !== undefined) data[k] = v;
  };
  maybe("vendor", body.vendor);
  maybe("invoiceNo", body.invoiceNo);
  if (body.invoiceDate !== undefined) {
    data.invoiceDate = body.invoiceDate ? new Date(String(body.invoiceDate)) : null;
  }
  maybe("currency", body.currency);
  maybe("goldWeightG", body.goldWeightG);
  maybe("goldRatePerG", body.goldRatePerG);
  if (body.metalCostCents !== undefined) data.metalCostCents = body.metalCostCents;
  if (body.totalCents !== undefined) data.totalCents = Math.round(Number(body.totalCents));
  if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;
  if (body.paidAmountCents !== undefined) data.paidAmountCents = body.paidAmountCents;
  if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(String(body.paidAt)) : null;
  maybe("paymentMethod", body.paymentMethod);
  maybe("notes", body.notes);

  const invoice = await prisma.vendorInvoice.update({
    where: { id },
    data: data as object,
  });
  return NextResponse.json({ invoice });
}
