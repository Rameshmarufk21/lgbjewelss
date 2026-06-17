import { NextResponse } from "next/server";
import fs from "fs";
import { mediaPath, mimeForExt } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = mediaPath(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ext = id.split(".").pop() || "";
  const buf = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeForExt(ext),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}
