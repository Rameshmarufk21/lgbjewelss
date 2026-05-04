import { NextResponse } from "next/server";
import { buildCatalogWorkbook, buildCatalogWorkbookFromOrders } from "@/lib/excel/exportWorkbook";

export const dynamic = "force-dynamic";

function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/postgresql:\/\/|postgres:\/\/|DATABASE_URL/i.test(msg)) {
    return "Excel export failed: database is not configured. Set DATABASE_URL to a postgres:// URL, then retry.";
  }
  return "Excel export failed. Please retry or contact support.";
}

export async function GET() {
  try {
    const buf = await buildCatalogWorkbook();
    const filename = `jewelry-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { orders?: unknown[] };
    const orders = Array.isArray(body.orders) ? body.orders : [];
    const buf = await buildCatalogWorkbookFromOrders(orders as Parameters<typeof buildCatalogWorkbookFromOrders>[0]);
    const filename = `jewelry-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 503 });
  }
}
