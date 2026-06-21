import { NextResponse } from "next/server";
import { parseOrdersFromWorkbook } from "@/lib/excel/importOrders";

export const dynamic = "force-dynamic";

/**
 * Parse an exported orders workbook (the "Cards" sheet) and hand the rows back as
 * JSON. The client merges them into localStorage `lgb_orders`, tagged with the
 * company the user picked on the Export page.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const orders = await parseOrdersFromWorkbook(buffer);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not read workbook";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
