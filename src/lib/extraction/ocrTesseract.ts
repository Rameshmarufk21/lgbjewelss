/**
 * Free on-server OCR (Tesseract). We pre-process the image (grayscale + contrast +
 * sharpen + upscale) to lift accuracy on phone photos.
 *
 * IMPORTANT (serverless): tesseract.js's default `createWorker('eng')` downloads the
 * WASM core + the `eng.traineddata` language file from a CDN at runtime, then tries
 * to cache it to disk at `process.cwd()`. On Vercel, the function filesystem is
 * read-only outside `/tmp`, and CDN egress on a cold start can be slow/unreliable —
 * this caused scans to hang forever on "Reading…" in production while working fine
 * locally. We ship `eng.traineddata` at the project root and point `langPath` at it.
 *
 * SPEED: creating a worker + loading the language model costs ~250–400ms. We keep a
 * single worker alive for the lifetime of the (warm) serverless instance and reuse
 * it, serializing recognize() calls so they don't clobber each other.
 */
import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;
// Serialize recognize() calls — one worker processes one image at a time.
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1 /* OEM.LSTM_ONLY */, {
        langPath: process.cwd(), // local eng.traineddata, no CDN fetch
        gzip: false,
        cachePath: "/tmp", // only writable dir in serverless
      });
    })().catch((err) => {
      workerPromise = null; // allow retry on next call if init failed
      throw err;
    });
  }
  return workerPromise;
}

async function preprocess(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(buffer, { failOn: "none" }).rotate(); // auto-orient from EXIF
    const meta = await img.metadata();
    // Upscale small images so text is legible to Tesseract. 1200px is plenty for the
    // large headline/style text we extract and is faster than larger targets.
    const width = meta.width ?? 0;
    const pipeline = width && width < 1200 ? img.resize({ width: 1200 }) : img;
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
  const worker = await getWorker();
  // Chain onto the queue so concurrent callers don't run recognize() in parallel
  // on the same worker.
  const run = queue.then(async () => {
    const {
      data: { text },
    } = await worker.recognize(prepped);
    return text ?? "";
  });
  // Keep the queue alive even if this call rejects.
  queue = run.catch(() => undefined);
  return run;
}
