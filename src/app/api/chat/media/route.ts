import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { addMedia, saveChatMedia, clientMediaUrl } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(req: Request) {
  const u = await currentUser();
  const user = u?.userId || "guest";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 12 MB)" }, { status: 413 });

  const mime = file.type || "application/octet-stream";
  const kind = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : null;
  if (!kind) return NextResponse.json({ error: "Only image or audio files allowed" }, { status: 415 });

  const caption = String(form.get("caption") || "").trim() || undefined;
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const stored = await saveChatMedia(buf, mime);
    const msg = await addMedia(user, kind, { ...stored, mediaMime: mime, caption });
    return NextResponse.json(
      {
        ok: true,
        message: {
          seq: msg.seq,
          id: msg.id,
          user: msg.user,
          kind: msg.kind,
          text: msg.text ?? undefined,
          mediaUrl: clientMediaUrl(msg),
          mediaMime: msg.mediaMime ?? undefined,
          createdAt: msg.createdAt.toISOString(),
          mine: true,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
