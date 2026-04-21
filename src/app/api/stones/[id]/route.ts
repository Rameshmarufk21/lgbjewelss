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

  const data: Record<string, unknown> = {};
  const s = (k: string, v: unknown) => {
    if (v !== undefined) data[k] = v;
  };
  s("supplier", body.supplier);
  s("shape", body.shape);
  s("carat", body.carat);
  s("notes", body.notes);
  s("itemCategory", body.itemCategory);
  s("colorGrade", body.colorGrade);
  s("clarityGrade", body.clarityGrade);
  s("sourcing", body.sourcing);
  s("certificateNumber", body.certificateNumber);
  s("certificateLab", body.certificateLab);
  if (body.costCents !== undefined) data.costCents = body.costCents === null ? null : Math.round(Number(body.costCents));
  if (body.cost !== undefined && body.costCents === undefined) {
    data.costCents = body.cost === null ? null : Math.round(Number(body.cost) * 100);
  }

  const stone = await prisma.stoneAssignment.update({
    where: { id },
    data: data as object,
  });
  return NextResponse.json({ stone });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.stoneAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
