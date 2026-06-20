import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { adminUsernamesLower } from "@/lib/auth/users";
import { getMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** Count of unread messages VISIBLE to the caller (admin messages excluded for non-admins). */
export async function GET(req: Request) {
  const u = await currentUser();
  const isAdmin = (u?.role ?? "admin") === "admin";
  const me = u?.userId || "guest";
  const since = Number(new URL(req.url).searchParams.get("since") || "0") || 0;
  const { messages, lastSeq } = await getMessages(since);
  const admins = isAdmin ? new Set<string>() : await adminUsernamesLower();
  const count = messages.filter(
    (m) => m.user !== me && (isAdmin || !admins.has(m.user.toLowerCase())),
  ).length;
  return NextResponse.json({ ok: true, count, lastSeq }, { headers: { "Cache-Control": "no-store" } });
}
