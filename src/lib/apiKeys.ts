import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type ApiService = "gemini" | "groq";
export type KeySource = "stored" | "env" | "none";

/** AES key from ENCRYPTION_SECRET (64 hex). When unset, keys are stored as-is
 *  (the database is the trust boundary). */
function getEncKey(): Buffer | null {
  const env = process.env.ENCRYPTION_SECRET?.trim();
  if (env && /^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
  return null;
}

export function encryptKey(text: string): string {
  const key = getEncKey();
  if (!key) return text; // plaintext (DB-protected) when no secret configured
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptKey(stored: string): string {
  if (!stored.startsWith("enc:")) return stored; // plaintext
  const key = getEncKey();
  if (!key) return ""; // encrypted value but no secret to decrypt → treat as missing
  const [, ivHex, tagHex, encHex] = stored.split(":");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function envKeyFor(service: ApiService): string {
  return (service === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY)?.trim() || "";
}

export async function setStoredKey(service: ApiService, value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.appApiKey.deleteMany({ where: { service } });
    return;
  }
  const enc = encryptKey(v);
  await prisma.appApiKey.upsert({
    where: { service },
    create: { service, value: enc },
    update: { value: enc },
  });
}

export async function getStoredKey(service: ApiService): Promise<string | null> {
  const row = await prisma.appApiKey.findUnique({ where: { service } }).catch(() => null);
  if (!row?.value) return null;
  const v = decryptKey(row.value);
  return v || null;
}

/** Where the active key comes from — for Settings status (never the value). */
export async function apiKeySource(service: ApiService): Promise<KeySource> {
  if (await getStoredKey(service)) return "stored";
  if (envKeyFor(service)) return "env";
  return "none";
}

/** Resolve the active key (DB first, then env). Returns "" if none. */
export async function resolveApiKey(service: ApiService): Promise<string> {
  const stored = await getStoredKey(service);
  return stored || envKeyFor(service) || "";
}

/** Like resolveApiKey but throws when no key is configured. */
export async function getApiKey(service: ApiService): Promise<string> {
  const key = await resolveApiKey(service);
  if (key) return key;
  throw new Error(`No API key for ${service}. Add it in Settings → AI keys, or set ${service.toUpperCase()}_API_KEY.`);
}
