import "server-only";
import path from "path";
import crypto from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import type { ChatMessage } from "@prisma/client";

export type { ChatMessage };
export type ChatKind = "text" | "image" | "audio";

const CHAT_UPLOADS = path.join(process.cwd(), "uploads", "chat");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
};
export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] || (mime.startsWith("audio/") ? "webm" : "bin");
}

export async function addText(user: string, text: string): Promise<ChatMessage> {
  return prisma.chatMessage.create({ data: { user, kind: "text", text: text.slice(0, 4000) } });
}

export async function addMedia(
  user: string,
  kind: "image" | "audio",
  media: { mediaUrl: string | null; mediaPath: string | null; mediaMime: string; caption?: string },
): Promise<ChatMessage> {
  return prisma.chatMessage.create({
    data: {
      user,
      kind,
      text: media.caption ? media.caption.slice(0, 4000) : null,
      mediaUrl: media.mediaUrl,
      mediaPath: media.mediaPath,
      mediaMime: media.mediaMime,
    },
  });
}

export async function lastSeq(): Promise<number> {
  const m = await prisma.chatMessage.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
  return m?.seq ?? 0;
}

export async function getMessages(afterSeq: number, limit = 100): Promise<{ messages: ChatMessage[]; lastSeq: number }> {
  if (afterSeq > 0) {
    const messages = await prisma.chatMessage.findMany({ where: { seq: { gt: afterSeq } }, orderBy: { seq: "asc" } });
    return { messages, lastSeq: await lastSeq() };
  }
  const recent = await prisma.chatMessage.findMany({ orderBy: { seq: "desc" }, take: limit });
  recent.reverse();
  const last = recent.length ? recent[recent.length - 1].seq : 0;
  return { messages: recent, lastSeq: last };
}

/** Store chat media on Vercel Blob (public) or local uploads/chat in dev. */
export async function saveChatMedia(
  buffer: Buffer,
  mime: string,
): Promise<{ mediaUrl: string | null; mediaPath: string | null }> {
  const name = `${crypto.randomBytes(12).toString("hex")}.${extForMime(mime)}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for chat media in production (Vercel Blob).");
  }
  if (token) {
    const blob = await put(`chat/${name}`, buffer, { access: "public", token, contentType: mime });
    return { mediaUrl: blob.url, mediaPath: null };
  }
  await mkdir(CHAT_UPLOADS, { recursive: true });
  await writeFile(path.join(CHAT_UPLOADS, name), buffer);
  return { mediaUrl: null, mediaPath: `chat/${name}` };
}

/** Read a locally-stored chat media file (dev fallback) by message id. */
export async function readLocalMedia(messageId: string): Promise<{ buf: Buffer; mime: string } | null> {
  const m = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!m?.mediaPath) return null;
  const rel = m.mediaPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.includes("..")) return null;
  try {
    const buf = await readFile(path.join(process.cwd(), "uploads", ...rel.split("/")));
    return { buf, mime: m.mediaMime || "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function getMessageById(id: string): Promise<ChatMessage | null> {
  return prisma.chatMessage.findUnique({ where: { id } });
}

/** The URL the client should use: blob URL directly, else the local proxy route. */
export function clientMediaUrl(m: ChatMessage): string | null {
  return m.mediaUrl || (m.mediaPath ? `/api/chat/media/${m.id}` : null);
}
