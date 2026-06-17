import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { addMessage, saveMedia } from "@/lib/chat";

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
  const mediaId = saveMedia(buf, mime);
  const msg = addMessage({ user, kind, mediaId, mediaMime: mime, text: caption });
  return NextResponse.json({ ok: true, message: { ...msg, mine: true } }, { headers: { "Cache-Control": "no-store" } });
}
