import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/postgresql:\/\/|postgres:\/\/|DATABASE_URL/i.test(msg)) {
    return "Database not configured. Set DATABASE_URL in .env.local to a postgres:// URL, then run `npx prisma migrate dev`.";
  }
  return msg.slice(0, 240);
}

export async function GET() {
  try {
    const makers = await prisma.maker.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ makers });
  } catch (err) {
    return NextResponse.json({ makers: [], error: dbErrorMessage(err) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const maker = await prisma.maker.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    return NextResponse.json({ maker });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await prisma.maker.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 503 });
  }
}
