import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: vendorInvoiceId } = await ctx.params;
  const inv = await prisma.vendorInvoice.findUnique({ where: { id: vendorInvoiceId } });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const max = await prisma.vendorInvoiceLine.aggregate({
    where: { vendorInvoiceId },
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  const line = await prisma.vendorInvoiceLine.create({
    data: {
      vendorInvoiceId,
      sortOrder,
      description: String(body.description ?? "").trim() || "Line",
      metalOrKarat: typeof body.metalOrKarat === "string" ? body.metalOrKarat.trim() || null : null,
      weightGrams: typeof body.weightGrams === "number" ? body.weightGrams : null,
      weightDwt: typeof body.weightDwt === "number" ? body.weightDwt : null,
      quantity: typeof body.quantity === "number" ? Math.round(body.quantity) : null,
      lineTotalCents:
        body.lineTotalCents != null
          ? Math.round(Number(body.lineTotalCents))
          : body.lineTotal != null
            ? Math.round(Number(body.lineTotal) * 100)
            : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    },
  });

  return NextResponse.json({ line });
}
