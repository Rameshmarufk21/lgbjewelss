import ExcelJS from "exceljs";

/**
 * Parse the "Cards" sheet produced by buildCatalogWorkbookFromOrders back into
 * plain order objects (the same shape stored in localStorage `lgb_orders`).
 * Used by the per-company Excel import on the Export page.
 */
export type ImportedOrder = Record<string, string | number> & { id?: string };

// Cards-sheet header (snake_case) -> order field (camelCase).
const HEADER_TO_FIELD: Record<string, string> = {
  order_id: "id",
  style_code: "styleCode",
  product_type: "productType",
  status: "status",
  placed_by: "placedBy",
  created_at: "createdAt",
  metal: "metal",
  size: "size",
  cast_vendor: "castVendor",
  cast_invoice: "castInvoice",
  cast_date: "castDate",
  cast_total: "castTotal",
  setter: "setter",
  set_invoice: "setInvoice",
  set_date: "setDate",
  set_total: "setTotal",
  stone_shape: "stoneShape",
  stone_size_mm: "stoneMM",
  stone_pcs: "stonePcs",
  stone_ct: "stoneCt",
  stone_total: "stoneTotal",
  notes: "notes",
};

const NUMERIC_FIELDS = new Set([
  "castTotal",
  "setTotal",
  "stonePcs",
  "stoneCt",
  "stoneTotal",
]);

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // Rich text / hyperlink / formula result cells.
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result != null) return String(v.result);
    return "";
  }
  return String(value);
}

export async function parseOrdersFromWorkbook(buffer: Uint8Array): Promise<ImportedOrder[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Cards") || wb.worksheets[0];
  if (!sheet) return [];

  // Map column index -> field name from the header row.
  const headerRow = sheet.getRow(1);
  const colField: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const key = cellText(cell.value).trim().toLowerCase();
    const field = HEADER_TO_FIELD[key];
    if (field) colField[col] = field;
  });
  if (Object.keys(colField).length === 0) return [];

  const orders: ImportedOrder[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const order: ImportedOrder = {};
    let hasData = false;
    for (const [colStr, field] of Object.entries(colField)) {
      const raw = cellText(row.getCell(Number(colStr)).value).trim();
      if (!raw) continue;
      hasData = true;
      if (NUMERIC_FIELDS.has(field)) {
        const n = Number.parseFloat(raw.replace(/,/g, ""));
        order[field] = Number.isFinite(n) ? n : raw;
      } else {
        order[field] = raw;
      }
    }
    if (hasData) orders.push(order);
  }
  return orders;
}
