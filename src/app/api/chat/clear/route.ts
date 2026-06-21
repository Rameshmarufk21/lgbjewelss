import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { clearAllMessages } from "@/lib/chat";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Clear the entire chat history. Admin only. */
export async function POST() {
  const u = await currentUser();
  const isAdmin = (u?.role ?? "admin") === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Only an admin can clear the chat" }, { status: 403 });
  }
  const count = await clearAllMessages();
  return NextResponse.json({ ok: true, cleared: count }, { headers: NO_STORE });
}
