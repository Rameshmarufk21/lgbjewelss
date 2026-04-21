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

  const stone = await prisma.stoneAssignment.create({
    data: {
      productId,
      memoId: typeof body.memoId === "string" ? body.memoId : null,
      supplier: typeof body.supplier === "string" ? body.supplier : null,
      carat: typeof body.carat === "number" ? body.carat : null,
      shape: typeof body.shape === "string" ? body.shape : null,
      costCents:
        body.costCents != null
          ? Math.round(Number(body.costCents))
          : body.cost != null
            ? Math.round(Number(body.cost) * 100)
            : null,
      returnDate: body.returnDate ? new Date(String(body.returnDate)) : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      assetId: typeof body.assetId === "string" ? body.assetId : null,
      itemCategory: typeof body.itemCategory === "string" ? body.itemCategory : null,
      colorGrade: typeof body.colorGrade === "string" ? body.colorGrade : null,
      clarityGrade: typeof body.clarityGrade === "string" ? body.clarityGrade : null,
      sourcing: typeof body.sourcing === "string" ? body.sourcing : null,
      certificateNumber:
        typeof body.certificateNumber === "string" ? body.certificateNumber : null,
      certificateLab: typeof body.certificateLab === "string" ? body.certificateLab : null,
    },
  });

  return NextResponse.json({ stone });
}
