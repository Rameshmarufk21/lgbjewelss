import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  const kind = typeof body.kind === "string" ? body.kind : "invoice_casting";
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  if (kind === "memo") {
    return NextResponse.json(
      {
        error:
          "Memo OCR is disabled. Upload the memo as a photo for reference icons on the card, and enter stone details with the structured form on the order page.",
      },
      { status: 400 },
    );
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const job = await prisma.extractionJob.create({
    data: {
      productId: asset.productId,
      assetId,
      kind,
      status: "pending",
    },
  });

  return NextResponse.json({ job });
}
