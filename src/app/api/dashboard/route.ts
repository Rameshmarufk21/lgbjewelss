import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, parseISO, isValid } from "date-fns";
import { computeProductFinancials } from "@/lib/aggregates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const now = new Date();
  const base = month && isValid(parseISO(`${month}-01`)) ? parseISO(`${month}-01`) : now;
  const from = startOfMonth(base);
  const to = endOfMonth(base);

  const products = await prisma.product.findMany({
    where: {
      updatedAt: { gte: from, lte: to },
    },
    include: { maker: true },
  });

  let totalCostCents = 0;
  let totalSellCents = 0;
  const byStatus: Record<string, number> = {};
  const byMaker: Record<string, number> = {};

  for (const p of products) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    const makerName = p.makerId ? p.maker?.name ?? "unknown" : "unassigned";
    byMaker[makerName] = (byMaker[makerName] ?? 0) + 1;

    const fin = await computeProductFinancials(p.id);
    totalCostCents += fin.grandCostCents;
    if (p.sellPriceCents != null) totalSellCents += p.sellPriceCents;
  }

  const profitCents = totalSellCents - totalCostCents;

  return NextResponse.json({
    month: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`,
    range: { from: from.toISOString(), to: to.toISOString() },
    productCount: products.length,
    totalCostCents,
    totalSellCents,
    profitCents,
    byStatus,
    byMaker,
  });
}
