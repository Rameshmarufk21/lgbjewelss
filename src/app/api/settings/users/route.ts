import { NextResponse } from "next/server";
import { currentUser, isCurrentUserAdmin } from "@/lib/auth/session";
import { addUser, listUsers, removeUser, setUserPassword, type Role } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

async function guard(): Promise<NextResponse | null> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  // Hide admin accounts from everyone except the admin viewing themselves.
  const me = (await currentUser())?.userId?.toLowerCase() ?? "";
  const all = await listUsers();
  const users = all.filter((u) => u.role !== "admin" || u.username.toLowerCase() === me);
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string; role?: string };
  const role: Role = body.role === "admin" ? "admin" : "user";
  const res = await addUser(String(body.username || ""), String(body.password || ""), role);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}

export async function PATCH(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const res = await setUserPassword(String(body.username || ""), String(body.password || ""));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const username = new URL(req.url).searchParams.get("username") || "";
  const res = await removeUser(username);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}
