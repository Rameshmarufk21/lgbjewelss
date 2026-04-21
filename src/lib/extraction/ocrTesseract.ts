/**
 * Free on-server OCR (Tesseract). First run may download `eng.traineddata` (~4MB).
 * Works best on straight, well-lit photos of printed text.
 */

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
