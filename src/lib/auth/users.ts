import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type Role = "admin" | "user";
export type PublicUser = { username: string; role: Role; createdAt: string };

/** Temporary password for the seeded accounts — change in Settings → Users. */
export const DEFAULT_TEMP_PASSWORD = "lgb2026";
const DEFAULT_USERS: Array<{ username: string; role: Role }> = [
  { username: "admin", role: "admin" },
  { username: "Mirav", role: "user" },
  { username: "sagar", role: "user" },
  { username: "Khushi", role: "user" },
];

function hashPw(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}

function makeHash(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPw(password, salt) };
}

/** Create the default 4 accounts the first time (no users yet). Safe to call often. */
export async function ensureSeeded(): Promise<void> {
  const count = await prisma.appUser.count();
  if (count > 0) return;
  for (const u of DEFAULT_USERS) {
    const { salt, hash } = makeHash(DEFAULT_TEMP_PASSWORD);
    await prisma.appUser
      .create({ data: { username: u.username, usernameLower: u.username.toLowerCase(), role: u.role, salt, hash } })
      .catch(() => undefined); // ignore race / duplicate
  }
}

export async function verifyUser(username: string, password: string): Promise<{ username: string; role: Role } | null> {
  await ensureSeeded();
  const rec = await prisma.appUser.findUnique({ where: { usernameLower: username.trim().toLowerCase() } });
  if (!rec) return null;
  const candidate = Buffer.from(hashPw(password, rec.salt));
  const known = Buffer.from(rec.hash);
  if (candidate.length !== known.length || !crypto.timingSafeEqual(candidate, known)) return null;
  return { username: rec.username, role: rec.role === "admin" ? "admin" : "user" };
}

export async function getRole(username: string): Promise<Role | null> {
  const rec = await prisma.appUser.findUnique({ where: { usernameLower: username.trim().toLowerCase() } });
  return rec ? (rec.role === "admin" ? "admin" : "user") : null;
}

/** Lowercased usernames of all admins — used to hide admins in chat (one query). */
export async function adminUsernamesLower(): Promise<Set<string>> {
  const admins = await prisma.appUser.findMany({ where: { role: "admin" }, select: { usernameLower: true } });
  return new Set(admins.map((a) => a.usernameLower));
}

export async function listUsers(): Promise<PublicUser[]> {
  await ensureSeeded();
  const rows = await prisma.appUser.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((u) => ({ username: u.username, role: u.role === "admin" ? "admin" : "user", createdAt: u.createdAt.toISOString() }));
}

export async function addUser(username: string, password: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  await ensureSeeded();
  const uname = username.trim();
  if (!uname || !password) return { ok: false, error: "Username and password required" };
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(uname)) return { ok: false, error: "Username: 2–32 letters/numbers/._-" };
  const exists = await prisma.appUser.findUnique({ where: { usernameLower: uname.toLowerCase() } });
  if (exists) return { ok: false, error: "User already exists" };
  const { salt, hash } = makeHash(password);
  await prisma.appUser.create({
    data: { username: uname, usernameLower: uname.toLowerCase(), role: role === "admin" ? "admin" : "user", salt, hash },
  });
  return { ok: true };
}

export async function removeUser(username: string): Promise<{ ok: boolean; error?: string }> {
  const lower = username.trim().toLowerCase();
  const rec = await prisma.appUser.findUnique({ where: { usernameLower: lower } });
  if (!rec) return { ok: false, error: "User not found" };
  if (rec.role === "admin") {
    const adminCount = await prisma.appUser.count({ where: { role: "admin" } });
    if (adminCount <= 1) return { ok: false, error: "Cannot remove the last admin" };
  }
  await prisma.appUser.delete({ where: { usernameLower: lower } });
  return { ok: true };
}

export async function setUserPassword(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Password required" };
  const lower = username.trim().toLowerCase();
  const rec = await prisma.appUser.findUnique({ where: { usernameLower: lower } });
  if (!rec) return { ok: false, error: "User not found" };
  const { salt, hash } = makeHash(password);
  await prisma.appUser.update({ where: { usernameLower: lower }, data: { salt, hash } });
  return { ok: true };
}
