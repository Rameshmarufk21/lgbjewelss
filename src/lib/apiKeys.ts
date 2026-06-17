import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ApiService = "gemini" | "groq";
export type KeySource = "stored" | "env" | "none";

/** Server-side, git-ignored store so API keys never touch the browser. */
const DATA_DIR = path.join(process.cwd(), ".lgb-data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const SECRET_FILE = path.join(DATA_DIR, ".enc-secret");

function ensureDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

/**
 * AES key: prefer ENCRYPTION_SECRET (64 hex chars); otherwise generate a random
 * one and persist it locally (outside git) so encryption works with zero setup.
 */
function getEncKey(): Buffer {
  const env = process.env.ENCRYPTION_SECRET?.trim();
  if (env && /^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
  ensureDir();
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
    }
  } catch {
    /* ignore */
  }
  const gen = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(SECRET_FILE, gen, { mode: 0o600 });
  } catch {
    /* ignore */
  }
  return Buffer.from(gen, "hex");
}

export function encryptKey(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptKey(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

type KeyStore = Partial<Record<ApiService, string>>;

function readStore(): KeyStore {
  try {
    const raw = fs.readFileSync(KEYS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as KeyStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: KeyStore): void {
  ensureDir();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(store), { mode: 0o600 });
}

/** Save (or clear when value is empty) an encrypted key. Never logs the value. */
export function setStoredKey(service: ApiService, value: string): void {
  const store = readStore();
  const v = value.trim();
  if (v) store[service] = encryptKey(v);
  else delete store[service];
  writeStore(store);
}

export function getStoredKey(service: ApiService): string | null {
  const enc = readStore()[service];
  if (!enc) return null;
  try {
    return decryptKey(enc);
  } catch {
    return null;
  }
}

function envKeyFor(service: ApiService): string {
  return (service === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY)?.trim() || "";
}

/** Where the active key comes from — for the Settings status display (never the value). */
export function apiKeySource(service: ApiService): KeySource {
  if (getStoredKey(service)) return "stored";
  if (envKeyFor(service)) return "env";
  return "none";
}

/** Resolve the active key (stored first, then env). Returns "" if none — sync, for routes. */
export function resolveApiKey(service: ApiService): string {
  return getStoredKey(service) || envKeyFor(service) || "";
}

export async function getApiKey(service: ApiService): Promise<string> {
  const key = resolveApiKey(service);
  if (key) return key;
  throw new Error(`No API key for ${service}. Add it in Settings → AI keys, or set ${service.toUpperCase()}_API_KEY.`);
}
