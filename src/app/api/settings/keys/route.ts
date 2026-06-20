import { NextResponse } from "next/server";
import { apiKeySource, setStoredKey, type ApiService } from "@/lib/apiKeys";
import { isCurrentUserAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SERVICES: ApiService[] = ["gemini", "groq"];

async function guard(): Promise<NextResponse | null> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

/**
 * Admin-only AI key management. Values are write-only — GET never returns the key
 * itself, only whether each is set. Non-admins are rejected with 403.
 */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const keys: Record<string, { set: boolean; source: string }> = {};
  for (const s of SERVICES) {
    const source = await apiKeySource(s);
    keys[s] = { set: source !== "none", source };
  }
  return NextResponse.json({ ok: true, keys });
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  let body: { service?: string; value?: string };
  try {
    body = (await req.json()) as { service?: string; value?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const service = String(body.service || "") as ApiService;
  if (!SERVICES.includes(service)) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }
  const value = typeof body.value === "string" ? body.value : "";
  await setStoredKey(service, value); // empty value clears the stored key
  return NextResponse.json({
    ok: true,
    service,
    set: value.trim().length > 0,
    source: await apiKeySource(service),
  });
}
