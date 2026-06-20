import { NextResponse } from "next/server";
import { getMessageById, readLocalMedia } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await getMessageById(id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Blob-stored media has a public URL — redirect to it.
  if (msg.mediaUrl) return NextResponse.redirect(msg.mediaUrl);
  const local = await readLocalMedia(id);
  if (!local) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(local.buf), {
    headers: {
      "Content-Type": local.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}
