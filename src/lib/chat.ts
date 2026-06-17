import "server-only";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Server-side group chat store (text + photo + voice). Lives in .lgb-data/
 * (git-ignored, persistent FS required). Messages sync via polling; media is
 * stored as files and served through an auth-gated route.
 */
const DATA_DIR = path.join(process.cwd(), ".lgb-data");
const CHAT_FILE = path.join(DATA_DIR, "chat.json");
const MEDIA_DIR = path.join(DATA_DIR, "chat-media");
const MAX_MESSAGES = 2000;

export type ChatKind = "text" | "image" | "audio";
export type ChatMessage = {
  seq: number;
  id: string;
  user: string;
  kind: ChatKind;
  text?: string;
  mediaId?: string;
  mediaMime?: string;
  createdAt: string;
};

type ChatFile = { lastSeq: number; messages: ChatMessage[] };

function ensureDir(): void {
  try {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function read(): ChatFile {
  try {
    const j = JSON.parse(fs.readFileSync(CHAT_FILE, "utf8")) as ChatFile;
    if (j && Array.isArray(j.messages) && typeof j.lastSeq === "number") return j;
  } catch {
    /* ignore */
  }
  return { lastSeq: 0, messages: [] };
}

function write(d: ChatFile): void {
  ensureDir();
  fs.writeFileSync(CHAT_FILE, JSON.stringify(d));
}

export function addMessage(m: {
  user: string;
  kind: ChatKind;
  text?: string;
  mediaId?: string;
  mediaMime?: string;
}): ChatMessage {
  const d = read();
  const seq = d.lastSeq + 1;
  const msg: ChatMessage = {
    seq,
    id: crypto.randomBytes(8).toString("hex"),
    user: m.user,
    kind: m.kind,
    text: m.text ? m.text.slice(0, 4000) : undefined,
    mediaId: m.mediaId,
    mediaMime: m.mediaMime,
    createdAt: new Date().toISOString(),
  };
  d.messages.push(msg);
  if (d.messages.length > MAX_MESSAGES) d.messages = d.messages.slice(-MAX_MESSAGES);
  d.lastSeq = seq;
  write(d);
  return msg;
}

export function lastSeq(): number {
  return read().lastSeq;
}

/** Messages after `afterSeq`; when afterSeq<=0, returns the most recent `limit`. */
export function getMessages(afterSeq: number, limit = 100): { messages: ChatMessage[]; lastSeq: number } {
  const d = read();
  const list = afterSeq > 0 ? d.messages.filter((m) => m.seq > afterSeq) : d.messages.slice(-limit);
  return { messages: list, lastSeq: d.lastSeq };
}

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

export function mimeForExt(ext: string): string {
  const found = Object.entries(EXT_BY_MIME).find(([, e]) => e === ext.toLowerCase());
  if (found) return found[0];
  return "application/octet-stream";
}

export function saveMedia(buf: Buffer, mime: string): string {
  ensureDir();
  const id = `${crypto.randomBytes(12).toString("hex")}.${extForMime(mime)}`;
  fs.writeFileSync(path.join(MEDIA_DIR, id), buf, { mode: 0o600 });
  return id;
}

/** Resolve a media id to a path on disk — null if invalid or missing (no traversal). */
export function mediaPath(id: string): string | null {
  if (!/^[a-f0-9]{8,}\.[a-z0-9]{2,5}$/i.test(id)) return null;
  const p = path.join(MEDIA_DIR, id);
  if (!p.startsWith(MEDIA_DIR)) return null;
  return fs.existsSync(p) ? p : null;
}
