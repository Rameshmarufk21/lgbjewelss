import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endOfMonth, parseISO, startOfMonth, isValid } from "date-fns";

export const dynamic = "force-dynamic";

/** Roll up casting invoice lines by metal/karat label for a calendar month (invoice date). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const now = new Date();
  const base =
    month && isValid(parseISO(`${month}-01`)) ? parseISO(`${month}-01`) : now;
  const from = startOfMonth(base);
  const to = endOfMonth(base);

  const lines = await prisma.vendorInvoiceLine.findMany({
    where: {
      vendorInvoice: {
        invoiceDate: { gte: from, lte: to },
      },
    },
    include: {
      vendorInvoice: { select: { invoiceNo: true, vendor: true, invoiceDate: true } },
    },
  });

  const byMetal: Record<
    string,
    { lineCount: number; totalGrams: number; totalDwt: number; costCents: number }
  > = {};

  for (const L of lines) {
    const key = (L.metalOrKarat ?? "unspecified").trim() || "unspecified";
    if (!byMetal[key]) {
      byMetal[key] = { lineCount: 0, totalGrams: 0, totalDwt: 0, costCents: 0 };
    }
    const b = byMetal[key];
    b.lineCount += 1;
    b.totalGrams += L.weightGrams ?? 0;
    b.totalDwt += L.weightDwt ?? 0;
    b.costCents += L.lineTotalCents ?? 0;
  }

  return NextResponse.json({
    month: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`,
    range: { from: from.toISOString(), to: to.toISOString() },
    byMetal,
    lineCount: lines.length,
  });
}
