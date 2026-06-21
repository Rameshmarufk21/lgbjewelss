import { NextResponse } from "next/server";
import { parseCadSpec, parseMtaInvoice } from "@/lib/extraction/deterministicParsers";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY: run a deterministic parser directly on raw OCR text (skips OCR) so the
 * parsers can be iterated quickly against captured text fixtures. Disabled in prod.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; kind?: string };
  const text = String(body.text || "");
  const out = body.kind === "mta" ? parseMtaInvoice(text) : parseCadSpec(text);
  return NextResponse.json({ ok: true, extracted: out });
}
