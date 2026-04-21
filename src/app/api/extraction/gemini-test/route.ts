import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Minimal call to verify server `GEMINI_API_KEY` (never read keys from the request body). */
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY is not set on the server (e.g. Vercel → Environment Variables)." },
      { status: 400 },
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with only JSON: {"ok":true,"model":"' + model + '"}' }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Gemini HTTP ${res.status}`, detail: raw.slice(0, 400) },
        { status: 502 },
      );
    }
    let parsed: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON from Gemini", detail: raw.slice(0, 200) }, { status: 502 });
    }
    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ ok: false, error: "Empty response from Gemini", detail: raw.slice(0, 300) }, { status: 502 });
    }
    const inner = JSON.parse(text.replace(/```json\s*/gi, "").replace(/```/g, "").trim()) as { ok?: boolean };
    return NextResponse.json({ ok: true, model, sample: inner });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
