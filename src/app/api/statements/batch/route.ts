import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findInvoicesByNumbers } from "@/lib/statements";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const numbers = body?.numbers;
  const name = typeof body?.name === "string" ? body.name : null;
  if (!Array.isArray(numbers) || !numbers.every((x: unknown) => typeof x === "string")) {
    return NextResponse.json({ error: "numbers: string[] required" }, { status: 400 });
  }

  const { matched, missing, sumCents } = await findInvoicesByNumbers(numbers);

  const batch = await prisma.statementBatch.create({
    data: {
      name,
      notes: typeof body?.notes === "string" ? body.notes : null,
      totalMatchedCents: sumCents,
      paymentStatus: typeof body?.paymentStatus === "string" ? body.paymentStatus : "unpaid",
      paidAmountCents:
        body?.paidAmountCents != null ? Math.round(Number(body.paidAmountCents)) : null,
      paidAt: body?.paidAt ? new Date(String(body.paidAt)) : null,
      paymentMethod: typeof body?.paymentMethod === "string" ? body.paymentMethod : null,
      lines: {
        create: matched.map((m) => ({
          vendorInvoiceId: m.invoice!.id,
          rawInvoiceNo: m.token,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json({ batch, missing });
}
