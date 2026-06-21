import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { deleteMessage, editMessageText, getMessageById } from "@/lib/chat";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

async function viewer(): Promise<{ user: string; isAdmin: boolean }> {
  const u = await currentUser();
  return { user: u?.userId || "guest", isAdmin: (u?.role ?? "admin") === "admin" };
}

/** Edit a message's text. Allowed for the author (own text messages only). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, isAdmin } = await viewer();
  const msg = await getMessageById(id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (msg.user !== user && !isAdmin) {
    return NextResponse.json({ error: "You can only edit your own messages" }, { status: 403 });
  }
  if (msg.kind !== "text") {
    return NextResponse.json({ error: "Only text messages can be edited" }, { status: 400 });
  }
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  await editMessageText(id, text);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Delete a message. Allowed for the author or any admin. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, isAdmin } = await viewer();
  const msg = await getMessageById(id);
  if (!msg) return NextResponse.json({ ok: true }, { headers: NO_STORE }); // already gone
  if (msg.user !== user && !isAdmin) {
    return NextResponse.json({ error: "You can only delete your own messages" }, { status: 403 });
  }
  await deleteMessage(id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
