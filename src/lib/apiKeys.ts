import "server-only";
import crypto from "crypto";

function getEncKey(): Buffer {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error("ENCRYPTION_SECRET not set in environment variables");
  return Buffer.from(s, "hex");
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
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getApiKey(service: "gemini" | "groq"): Promise<string> {
  // Try database first (keys saved via Settings UI)
  try {
    const { prisma } = await import("@/lib/prisma");
    const client = prisma as unknown as {
      apiKey?: { findUnique: (args: { where: { service: string } }) => Promise<{ keyValue: string } | null> };
    };
    if (client.apiKey) {
      const row = await client.apiKey.findUnique({ where: { service } });
      if (row?.keyValue) return decryptKey(row.keyValue);
    }
  } catch {
    // DB not available or model not yet migrated — fall through
  }
  // Fall back to environment variable
  const envKey =
    service === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
  if (envKey) return envKey;
  throw new Error(
    `No API key for ${service}. Add GEMINI_API_KEY to environment variables.`,
  );
}
