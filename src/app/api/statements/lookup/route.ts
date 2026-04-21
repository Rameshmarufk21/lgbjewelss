import { NextResponse } from "next/server";
import { findInvoicesByNumbers } from "@/lib/statements";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nums = body?.numbers;
  if (!Array.isArray(nums) || !nums.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "numbers: string[] required" }, { status: 400 });
  }
  const result = await findInvoicesByNumbers(nums);
  return NextResponse.json(result);
}
