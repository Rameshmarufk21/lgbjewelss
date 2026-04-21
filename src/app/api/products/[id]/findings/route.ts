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

  const description = String(body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const costCents =
    body.costCents != null
      ? Math.round(Number(body.costCents))
      : Math.round(Number(body.cost ?? 0) * 100);

  const finding = await prisma.findingPurchase.create({
    data: {
      productId,
      description,
      sourceShop: typeof body.sourceShop === "string" ? body.sourceShop : null,
      costCents,
      invoiceRef: typeof body.invoiceRef === "string" ? body.invoiceRef : null,
      assetId: typeof body.assetId === "string" ? body.assetId : null,
    },
  });

  return NextResponse.json({ finding });
}
