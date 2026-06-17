/** Session token parse + verify (Edge + Node via Web Crypto). */

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifySessionTokenAsync(
  token: string | undefined | null,
  secret: string,
): Promise<{ userId: string } | null> {
  if (!token || !secret) return null;
  try {
    const decoded = b64urlDecode(token);
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return null;
    const sig = decoded.slice(lastColon + 1);
    const rest = decoded.slice(0, lastColon);
    const expColon = rest.lastIndexOf(":");
    if (expColon < 0) return null;
    const userId = rest.slice(0, expColon);
    const exp = rest.slice(expColon + 1);
    if (!userId || !exp || !sig) return null;
    if (Date.now() > Number(exp)) return null;

    const payload = `${userId}:${exp}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = b64urlEncode(new Uint8Array(mac));
    const a = new TextEncoder().encode(sig);
    const b = new TextEncoder().encode(expected);
    if (!timingSafeEqual(a, b)) return null;
    return { userId };
  } catch {
    return null;
  }
}
