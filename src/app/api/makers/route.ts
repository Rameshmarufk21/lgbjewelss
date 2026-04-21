import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const makers = await prisma.maker.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ makers });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const maker = await prisma.maker.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  return NextResponse.json({ maker });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.maker.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
