import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkCredentials,
  createSessionToken,
  isAuthEnabled,
} from "@/lib/auth/session";

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, userId: "guest", authDisabled: true });
  }

  let body: { userId?: string; password?: string };
  try {
    body = (await req.json()) as { userId?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  const password = String(body.password ?? "");
  if (!userId || !password) {
    return NextResponse.json({ ok: false, error: "User ID and password required" }, { status: 400 });
  }

  if (!checkCredentials(userId, password)) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const token = createSessionToken(userId);
  const res = NextResponse.json({ ok: true, userId });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
