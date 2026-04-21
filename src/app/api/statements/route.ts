import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const batches = await prisma.statementBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { invoice: true } } },
    take: 100,
  });
  return NextResponse.json({ batches });
}
