import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type Role = "admin" | "user";
export type UserRecord = { username: string; role: Role; salt: string; hash: string; createdAt: string };
export type PublicUser = { username: string; role: Role; createdAt: string };

const DATA_DIR = path.join(process.cwd(), ".lgb-data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

/** Temporary password for the seeded accounts — change in Settings → Users. */
export const DEFAULT_TEMP_PASSWORD = "lgb2026";
const DEFAULT_USERS: Array<{ username: string; role: Role }> = [
  { username: "admin", role: "admin" },
  { username: "Mirav", role: "user" },
  { username: "sagar", role: "user" },
  { username: "Khushi", role: "user" },
];

function ensureDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function hashPw(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}

function read(): UserRecord[] {
  try {
    const a = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as unknown;
    return Array.isArray(a) ? (a as UserRecord[]) : [];
  } catch {
    return [];
  }
}

function write(list: UserRecord[]): void {
  ensureDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

function makeUser(username: string, password: string, role: Role): UserRecord {
  const salt = crypto.randomBytes(16).toString("hex");
  return { username, role, salt, hash: hashPw(password, salt), createdAt: new Date().toISOString() };
}

/** Create the default 4 accounts on first run. */
export function ensureSeeded(): void {
  if (read().length) return;
  write(DEFAULT_USERS.map((u) => makeUser(u.username, DEFAULT_TEMP_PASSWORD, u.role)));
}

function findUser(username: string): UserRecord | undefined {
  const u = username.trim().toLowerCase();
  return read().find((x) => x.username.toLowerCase() === u);
}

export function verifyUser(username: string, password: string): UserRecord | null {
  ensureSeeded();
  const rec = findUser(username);
  if (!rec) return null;
  const candidate = Buffer.from(hashPw(password, rec.salt));
  const known = Buffer.from(rec.hash);
  if (candidate.length !== known.length || !crypto.timingSafeEqual(candidate, known)) return null;
  return rec;
}

export function getRole(username: string): Role | null {
  ensureSeeded();
  return findUser(username)?.role ?? null;
}

export function listUsers(): PublicUser[] {
  ensureSeeded();
  return read().map(({ username, role, createdAt }) => ({ username, role, createdAt }));
}

export function addUser(username: string, password: string, role: Role): { ok: boolean; error?: string } {
  ensureSeeded();
  const uname = username.trim();
  if (!uname || !password) return { ok: false, error: "Username and password required" };
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(uname)) return { ok: false, error: "Username: 2–32 letters/numbers/._-" };
  if (findUser(uname)) return { ok: false, error: "User already exists" };
  const list = read();
  list.push(makeUser(uname, password, role === "admin" ? "admin" : "user"));
  write(list);
  return { ok: true };
}

export function removeUser(username: string): { ok: boolean; error?: string } {
  ensureSeeded();
  const rec = findUser(username);
  if (!rec) return { ok: false, error: "User not found" };
  if (rec.role === "admin" && read().filter((u) => u.role === "admin").length <= 1) {
    return { ok: false, error: "Cannot remove the last admin" };
  }
  write(read().filter((u) => u.username.toLowerCase() !== username.trim().toLowerCase()));
  return { ok: true };
}

export function setUserPassword(username: string, password: string): { ok: boolean; error?: string } {
  ensureSeeded();
  if (!password) return { ok: false, error: "Password required" };
  const list = read();
  const rec = list.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!rec) return { ok: false, error: "User not found" };
  rec.salt = crypto.randomBytes(16).toString("hex");
  rec.hash = hashPw(password, rec.salt);
  write(list);
  return { ok: true };
}
