import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { adminUsernamesLower } from "@/lib/auth/users";
import { addText, getMessages, clientMediaUrl, type ChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

async function viewer(): Promise<{ user: string; isAdmin: boolean }> {
  const u = await currentUser();
  return { user: u?.userId || "guest", isAdmin: (u?.role ?? "admin") === "admin" };
}

function toClient(m: ChatMessage, me: string) {
  return {
    seq: m.seq,
    id: m.id,
    user: m.user,
    kind: m.kind,
    text: m.text ?? undefined,
    mediaUrl: clientMediaUrl(m),
    mediaMime: m.mediaMime ?? undefined,
    createdAt: m.createdAt.toISOString(),
    mine: m.user === me,
  };
}

export async function GET(req: Request) {
  const { user, isAdmin } = await viewer();
  const after = Number(new URL(req.url).searchParams.get("after") || "0") || 0;
  const { messages, lastSeq } = await getMessages(after);
  // Hide admin-authored messages from non-admins (admin is invisible).
  const admins = isAdmin ? new Set<string>() : await adminUsernamesLower();
  const visible = messages
    .filter((m) => isAdmin || !admins.has(m.user.toLowerCase()))
    .map((m) => toClient(m, user));
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
  const msg = await addText(user, text);
  return NextResponse.json({ ok: true, message: toClient(msg, user) }, { headers: NO_STORE });
}
