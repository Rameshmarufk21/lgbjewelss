import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, verifySessionToken } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/users";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, userId: "guest", role: "admin", authDisabled: true });
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId: session.userId, role: (await getRole(session.userId)) ?? "user" });
}
