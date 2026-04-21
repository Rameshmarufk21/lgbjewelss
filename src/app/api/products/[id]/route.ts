import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      maker: true,
      assets: true,
      vendorInvoices: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      stones: true,
      findings: true,
      extractions: { include: { asset: true }, orderBy: { createdAt: "desc" } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const maybe = (k: string, v: unknown) => {
    if (v !== undefined) data[k] = v;
  };
  maybe("displayName", body.displayName);
  maybe("cadFilenameStem", body.cadFilenameStem);
  maybe("status", body.status);
  maybe("makerId", body.makerId);
  maybe("clientName", body.clientName);
  maybe("clientPhone", body.clientPhone);
  maybe("clientEmail", body.clientEmail);
  maybe("clientNotes", body.clientNotes);
  if (body.sellPriceCents !== undefined) {
    data.sellPriceCents =
      body.sellPriceCents === null ? null : Math.round(Number(body.sellPriceCents));
  }
  maybe("currency", body.currency);
  maybe("notes", body.notes);

  await prisma.product.update({ where: { id }, data: data as object });
  await logActivity({
    productId: id,
    entityType: "Product",
    entityId: id,
    action: "update",
    payload: data,
  });
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      maker: true,
      assets: true,
      vendorInvoices: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      stones: true,
      findings: true,
      extractions: { include: { asset: true }, orderBy: { createdAt: "desc" } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  return NextResponse.json({ product });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
