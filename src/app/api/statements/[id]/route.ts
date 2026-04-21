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

  const batch = await prisma.statementBatch.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const paymentStatus =
    typeof body.paymentStatus === "string" ? body.paymentStatus : batch.paymentStatus;
  const paidAmountCents =
    body.paidAmountCents != null ? Math.round(Number(body.paidAmountCents)) : batch.paidAmountCents;
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : batch.paidAt;
  const paymentMethod =
    typeof body.paymentMethod === "string" ? body.paymentMethod : batch.paymentMethod;

  const updated = await prisma.statementBatch.update({
    where: { id },
    data: {
      paymentStatus,
      paidAmountCents,
      paidAt,
      paymentMethod,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    },
  });

  if (paymentStatus === "paid") {
    const invoiceIds = batch.lines.map((l) => l.vendorInvoiceId).filter(Boolean) as string[];
    for (const invId of invoiceIds) {
      await prisma.vendorInvoice.update({
        where: { id: invId },
        data: {
          paymentStatus: "paid",
          paidAt: paidAt ?? new Date(),
          paidAmountCents: paidAmountCents ?? undefined,
          paymentMethod: paymentMethod ?? undefined,
        },
      });
    }
  }

  return NextResponse.json({ batch: updated });
}
