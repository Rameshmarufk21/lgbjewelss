import { loadAssetBuffer } from "@/lib/uploads";
import { extractedInvoiceSchema } from "@/lib/schema/canonical";
import { prisma } from "@/lib/prisma";
import { ocrImageBuffer } from "@/lib/extraction/ocrTesseract";
import { heuristicInvoiceFromOcr } from "@/lib/extraction/heuristicFromOcr";

function isImageMime(mime: string): boolean {
  return /^image\/(jpeg|jpg|png|webp|gif|bmp|tiff?)$/i.test(mime);
}

export async function runExtractionJob(jobId: string): Promise<void> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: { asset: true },
  });
  if (!job) throw new Error("Job not found");

  await prisma.extractionJob.update({
    where: { id: jobId },
    data: { status: "processing", errorMessage: null },
  });

  try {
    if (job.kind === "memo") {
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "needs_review",
          ocrText: null,
          extractedJson: JSON.stringify({}),
          confidenceJson: JSON.stringify({}),
          errorMessage:
            "Memo photos are reference-only on the card — use the structured stone form for data. OCR is not run on memos.",
        },
      });
      return;
    }

    const buf = await loadAssetBuffer(job.asset);
    const mime = job.asset.mimeType || "application/octet-stream";

    if (!isImageMime(mime)) {
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "needs_review",
          ocrText: null,
          extractedJson: JSON.stringify({}),
          confidenceJson: JSON.stringify({}),
          errorMessage: "Extraction OCR only runs on image files (JPEG/PNG/WebP).",
        },
      });
      return;
    }

    let ocrText: string;
    try {
      ocrText = await ocrImageBuffer(buf);
    } catch (ocrErr) {
      const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorMessage: `OCR failed: ${msg}`,
        },
      });
      return;
    }

    const rawParsed = heuristicInvoiceFromOcr(ocrText);
    const parsed = extractedInvoiceSchema.parse(rawParsed);

    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "needs_review",
        ocrText: ocrText.slice(0, 50_000),
        extractedJson: JSON.stringify(parsed),
        confidenceJson: JSON.stringify(
          (parsed as { confidence?: Record<string, number> }).confidence ?? {},
        ),
        errorMessage: null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: msg },
    });
  }
}
