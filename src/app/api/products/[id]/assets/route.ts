import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUploadBuffer } from "@/lib/uploads";
import { randomUUID } from "node:crypto";
import type { AssetType } from "@/lib/types/status";
import { ASSET_TYPES } from "@/lib/types/status";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: productId } = await ctx.params;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const typeRaw = String(form.get("type") ?? "photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ASSET_TYPES.includes(typeRaw as AssetType)) {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const assetId = randomUUID();
  const mimeType = file.type || "application/octet-stream";
  const { storedPath, sha256, publicUrl } = await saveUploadBuffer({
    productId,
    assetId,
    originalName: file.name || "upload.bin",
    buffer,
    mimeType,
  });

  const asset = await prisma.asset.create({
    data: {
      id: assetId,
      productId,
      type: typeRaw,
      originalName: file.name || "upload.bin",
      storedPath,
      publicUrl,
      mimeType,
      sizeBytes: buffer.length,
      sha256,
    },
  });

  return NextResponse.json({ asset });
}
