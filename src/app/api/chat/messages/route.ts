import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/users";
import { addMessage, getMessages, type ChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

async function viewer(): Promise<{ user: string; isAdmin: boolean }> {
  const u = await currentUser();
  return { user: u?.userId || "guest", isAdmin: (u?.role ?? "admin") === "admin" };
}

/** Hide admin-authored messages from everyone except admins (admin is invisible). */
function visibleTo(messages: ChatMessage[], isAdmin: boolean): ChatMessage[] {
  if (isAdmin) return messages;
  return messages.filter((m) => getRole(m.user) !== "admin");
}

export async function GET(req: Request) {
  const { user, isAdmin } = await viewer();
  const after = Number(new URL(req.url).searchParams.get("after") || "0") || 0;
  const { messages, lastSeq } = getMessages(after);
  const visible = visibleTo(messages, isAdmin).map((m) => ({ ...m, mine: m.user === user }));
  // lastSeq is the TRUE store cursor so polling advances even past hidden messages.
  return NextResponse.json({ ok: true, messages: visible, lastSeq, me: user }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const { user } = await viewer();
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  const msg = addMessage({ user, kind: "text", text });
  return NextResponse.json({ ok: true, message: { ...msg, mine: true } }, { headers: NO_STORE });
}
