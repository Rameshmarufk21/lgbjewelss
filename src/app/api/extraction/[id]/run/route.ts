import { NextResponse } from "next/server";
import { runExtractionJob } from "@/lib/extraction/runExtraction";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = await prisma.extractionJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await runExtractionJob(id);
  const updated = await prisma.extractionJob.findUnique({ where: { id } });
  return NextResponse.json({ job: updated });
}
