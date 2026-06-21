/**
 * Free on-server OCR (Tesseract). We pre-process the image (grayscale + contrast +
 * sharpen + upscale) to lift accuracy on phone photos.
 *
 * IMPORTANT (serverless): tesseract.js's default `createWorker('eng')` downloads the
 * WASM core + the `eng.traineddata` language file from a CDN at runtime, then tries
 * to cache it to disk at `process.cwd()`. On Vercel, the function filesystem is
 * read-only outside `/tmp`, and CDN egress on a cold start can be slow/unreliable —
 * this is what was causing scans to hang forever on "Reading with AI…" in production
 * while working fine locally (where the cache write succeeds and masks the issue).
 *
 * Fix: `eng.traineddata` is already committed at the project root, so we point
 * `langPath` at it directly (no network) and `cachePath` at `/tmp` (the only
 * writable directory in serverless). The file is force-included in the Vercel
 * function bundle via `outputFileTracingIncludes` in next.config.ts.
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
  const worker = await createWorker("eng", 1 /* OEM.LSTM_ONLY */, {
    // Local copy, no CDN fetch — see comment above. langPath must be a plain
    // directory (not a URL) so tesseract.js reads `${langPath}/eng.traineddata`.
    langPath: process.cwd(),
    gzip: false,
    // Only /tmp is writable in serverless; this is also harmless locally.
    cachePath: "/tmp",
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(prepped);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
