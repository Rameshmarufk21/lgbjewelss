import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { verifyUser, setUserPassword } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

/** Self-service: any signed-in user changes their OWN password (needs current pw). */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }
  const ok = await verifyUser(me.userId, String(body.currentPassword || ""));
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  await setUserPassword(me.userId, newPassword);
  return NextResponse.json({ ok: true });
}
