import { NextResponse } from "next/server";
import { buildCatalogWorkbook } from "@/lib/excel/exportWorkbook";

export const dynamic = "force-dynamic";

export async function GET() {
  const buf = await buildCatalogWorkbook();
  const filename = `jewelry-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
