import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  const where = q
    ? {
        OR: [
          { id: { contains: q } },
          { displayName: { contains: q } },
          { cadFilenameStem: { contains: q } },
          { notes: { contains: q } },
          { clientName: { contains: q } },
          { clientEmail: { contains: q } },
          { maker: { name: { contains: q } } },
          {
            vendorInvoices: {
              some: {
                OR: [
                  { invoiceNo: { contains: q } },
                  { vendor: { contains: q } },
                ],
              },
            },
          },
          {
            stones: {
              some: {
                OR: [
                  { shape: { contains: q } },
                  { supplier: { contains: q } },
                  { notes: { contains: q } },
                  { itemCategory: { contains: q } },
                  { colorGrade: { contains: q } },
                  { clarityGrade: { contains: q } },
                  { certificateNumber: { contains: q } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const products = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      maker: true,
      vendorInvoices: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      stones: true,
      findings: true,
      assets: true,
    },
    take: 200,
  });

  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName : null;
  const cadFilenameStem =
    typeof body.cadFilenameStem === "string" ? body.cadFilenameStem : null;
  const status = typeof body.status === "string" ? body.status : "cad_sent";
  const makerId = typeof body.makerId === "string" ? body.makerId : null;

  const product = await prisma.product.create({
    data: {
      displayName,
      cadFilenameStem,
      status,
      makerId,
      clientName: typeof body.clientName === "string" ? body.clientName : null,
      clientPhone: typeof body.clientPhone === "string" ? body.clientPhone : null,
      clientEmail: typeof body.clientEmail === "string" ? body.clientEmail : null,
      clientNotes: typeof body.clientNotes === "string" ? body.clientNotes : null,
      sellPriceCents:
        typeof body.sellPriceCents === "number" ? Math.round(body.sellPriceCents) : null,
      currency: typeof body.currency === "string" ? body.currency : "USD",
      notes: typeof body.notes === "string" ? body.notes : null,
    },
  });

  return NextResponse.json({ product });
}
