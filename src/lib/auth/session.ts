import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthSecret, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth/config";
import { verifyUser, getRole, type Role } from "@/lib/auth/users";

export { SESSION_COOKIE, getAuthSecret, isAuthEnabled } from "@/lib/auth/config";

export function createSessionToken(userId: string): string {
  const secret = getAuthSecret();
  const exp = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const payload = `${userId}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifySessionToken(token: string | undefined | null): { userId: string } | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
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
    const secret = getAuthSecret();
    const payload = `${userId}:${exp}`;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function checkCredentials(userId: string, password: string): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  return (await verifyUser(userId, password)) !== null;
}

/** Read the signed-in user (and role) from the session cookie — for route handlers. */
export async function currentUser(): Promise<{ userId: string; role: Role } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const role = (await getRole(session.userId)) ?? "user";
  return { userId: session.userId, role };
}

/** Throws-free admin check for admin-only API routes. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!isAuthEnabled()) return true; // single-operator mode → treat as admin
  return (await currentUser())?.role === "admin";
}
