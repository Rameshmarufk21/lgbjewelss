import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export async function ensureUploadsDir(subdir?: string): Promise<string> {
  const dir = subdir ? path.join(UPLOADS_DIR, subdir) : UPLOADS_DIR;
  await mkdir(dir, { recursive: true });
  return dir;
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function blobToken(): string | null {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || null;
}

/** Returns relative path from UPLOADS_DIR for DB storage, and optional public blob URL. */
export async function saveUploadBuffer(opts: {
  productId: string;
  assetId: string;
  originalName: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ storedPath: string; sha256: string; publicUrl: string | null }> {
  const safe = sanitizeFilename(opts.originalName);
  const rel = path.join(opts.productId, `${opts.assetId}_${safe}`);
  const posixRel = rel.split(path.sep).join("/");
  const sha256 = sha256Hex(opts.buffer);

  const token = blobToken();
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production (Vercel Blob). Add it under Project → Environment Variables.",
    );
  }
  if (token) {
    const blob = await put(posixRel, opts.buffer, {
      access: "public",
      token,
      contentType: opts.mimeType?.trim() || "application/octet-stream",
    });
    return { storedPath: posixRel, sha256, publicUrl: blob.url };
  }

  await ensureUploadsDir(opts.productId);
  const abs = path.join(UPLOADS_DIR, opts.productId, `${opts.assetId}_${safe}`);
  await writeFile(abs, opts.buffer);
  return { storedPath: posixRel, sha256, publicUrl: null };
}

export function absoluteUploadPath(storedPath: string): string {
  return path.join(UPLOADS_DIR, ...storedPath.split("/"));
}

/** Load file bytes for OCR / processing (Vercel Blob URL or local uploads/). */
export async function loadAssetBuffer(asset: {
  storedPath: string;
  publicUrl: string | null;
}): Promise<Buffer> {
  if (asset.publicUrl) {
    const res = await fetch(asset.publicUrl);
    if (!res.ok) {
      throw new Error(`Asset fetch failed: ${res.status} ${asset.publicUrl.slice(0, 80)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(absoluteUploadPath(asset.storedPath));
}
