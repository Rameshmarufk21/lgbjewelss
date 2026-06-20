/**
 * Free on-server OCR (Tesseract). First run may download `eng.traineddata` (~4MB).
 * Works best on straight, well-lit photos of printed text. We pre-process the
 * image (grayscale + contrast + sharpen + upscale) to lift accuracy on phone photos.
 */

async function preprocess(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(buffer, { failOn: "none" }).rotate(); // auto-orient from EXIF
    const meta = await img.metadata();
    // Upscale small images so small print is legible to Tesseract.
    const width = meta.width ?? 0;
    const pipeline = width && width < 1600 ? img.resize({ width: 1800 }) : img;
    return await pipeline
      .grayscale()
      .normalize() // stretch contrast
      .sharpen()
      .toFormat("png")
      .toBuffer();
  } catch {
    return buffer; // if sharp fails, OCR the original
  }
}

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const prepped = await preprocess(buffer);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(prepped);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
