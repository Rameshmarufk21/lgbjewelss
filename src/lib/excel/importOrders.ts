import ExcelJS from "exceljs";

/**
 * Parse the exported workbook (supporting both jewelry.xlsx PROJECTS sheet block layout
 * and legacy flat tabular "Cards" sheets) back into plain order objects.
 */
export type ImportedOrder = Record<string, any> & { id?: string };

const STONE_SHAPES = new Set([
  "heart", "rd", "rnd", "oval", "mq", "marquise", "princess", "cushion", "pear", "emerald",
  "radiant", "baguette", "mixed", "trap", "em", "taper", "tapered", "round", "cush", "csh", "pr"
]);

function parseDate(val: any): string {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (val && typeof val === "object" && "result" in val) {
    return parseDate((val as any).result);
  }
  if (val != null) {
    const s = String(val).trim();
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  }
  return "";
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const val = cell.value;
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "result" in val) {
    const res = (val as any).result;
    if (typeof res === "number") return res;
  }
  const n = Number(String(val).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cellStr(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val == null) return "";
  if (typeof val === "object") {
    const v = val as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result != null) return String(v.result);
    return "";
  }
  return String(val).trim();
}

function parseProjectBlocksSheet(sheet: ExcelJS.Worksheet, companyId: string): ImportedOrder[] {
  const orders: ImportedOrder[] = [];
  const maxRow = sheet.rowCount;
  
  let r = 1;
  while (r <= maxRow) {
    const valA = cellStr(sheet.getRow(r).getCell(1));
    if (valA === "Project Number") {
      const projectNum = cellStr(sheet.getRow(r).getCell(2));
      const projectDate = parseDate(sheet.getRow(r).getCell(3).value);
      
      let placedBy = "";
      if (r + 2 <= maxRow && cellStr(sheet.getRow(r + 2).getCell(1)) === "Sales Person") {
        placedBy = cellStr(sheet.getRow(r + 2).getCell(2));
      }
      
      let clientName = "";
      if (r + 4 <= maxRow && cellStr(sheet.getRow(r + 4).getCell(1)) === "Client Name") {
        clientName = cellStr(sheet.getRow(r + 4).getCell(2));
      }
      
      let styleCode = "";
      if (r + 7 <= maxRow) {
        styleCode = cellStr(sheet.getRow(r + 7).getCell(3));
      }
      
      // Find Casting Block
      let castVendor = "";
      let castInvoice = "";
      let castDate = "";
      let castGrams = "";
      let castPrint = "";
      let castTotal = "";
      let metal = "";
      
      let cHdr = -1;
      for (let offset = 8; offset <= 15; offset++) {
        if (r + offset <= maxRow && cellStr(sheet.getRow(r + offset).getCell(1)) === "Casting Company") {
          cHdr = r + offset;
          break;
        }
      }
      
      if (cHdr !== -1) {
        const castRow = cHdr + 1;
        castVendor = cellStr(sheet.getRow(castRow).getCell(1));
        castDate = parseDate(sheet.getRow(castRow).getCell(2).value);
        castInvoice = cellStr(sheet.getRow(castRow).getCell(3));
        metal = cellStr(sheet.getRow(castRow).getCell(4));
        castGrams = cellStr(sheet.getRow(castRow).getCell(5));
        castPrint = cellStr(sheet.getRow(castRow).getCell(7));
        const totalVal = sheet.getRow(castRow).getCell(10).value ?? sheet.getRow(castRow).getCell(8).value;
        castTotal = totalVal != null ? String(cellNum(sheet.getRow(castRow).getCell(10)) ?? cellNum(sheet.getRow(castRow).getCell(8)) ?? "") : "";
      }
      
      // Find Setter Block
      let setterName = "";
      let setInvoice = "";
      let setDate = "";
      let setPrice = "";
      let setJob = "";
      
      let setHdr = -1;
      for (let offset = 15; offset <= 30; offset++) {
        if (r + offset <= maxRow && cellStr(sheet.getRow(r + offset).getCell(1)).trim() === "Setter") {
          setHdr = r + offset;
          break;
        }
      }
      
      if (setHdr !== -1) {
        const setRow = setHdr + 1;
        setterName = cellStr(sheet.getRow(setRow).getCell(2));
        setInvoice = cellStr(sheet.getRow(setRow).getCell(3));
        setJob = cellStr(sheet.getRow(setRow).getCell(4));
        setDate = parseDate(sheet.getRow(setRow).getCell(5).value);
        const setCostVal = cellNum(sheet.getRow(setRow).getCell(10));
        setPrice = setCostVal != null ? String(setCostVal) : "";
      }
      
      // Find Stones / Diamond Block
      let dHdr = -1;
      for (let offset = 11; offset <= 25; offset++) {
        if (r + offset <= maxRow) {
          const valCol1 = cellStr(sheet.getRow(r + offset).getCell(1));
          if (valCol1.includes("Diamond")) {
            dHdr = r + offset;
            break;
          }
        }
      }
      
      const stones: any[] = [];
      const extras: any[] = [];
      
      if (dHdr !== -1 && setHdr !== -1) {
        for (let sRow = dHdr + 1; sRow < setHdr; sRow++) {
          const col1Val = cellStr(sheet.getRow(sRow).getCell(1));
          const col2Val = cellStr(sheet.getRow(sRow).getCell(2));
          const col3Val = cellStr(sheet.getRow(sRow).getCell(3));
          const col4Val = cellNum(sheet.getRow(sRow).getCell(4));
          const col5Val = cellNum(sheet.getRow(sRow).getCell(5));
          const col7Val = cellStr(sheet.getRow(sRow).getCell(7));
          const col8Cell = sheet.getRow(sRow).getCell(8);
          const col10Cell = sheet.getRow(sRow).getCell(10);
          const costVal = cellNum(col10Cell) ?? cellNum(col8Cell);
          
          if (col1Val && !col2Val) {
            extras.push({
              desc: col1Val,
              cost: costVal != null ? String(costVal) : ""
            });
          } else if (col2Val) {
            const isStone = STONE_SHAPES.has(col2Val.toLowerCase()) || col4Val != null || col5Val != null;
            if (isStone) {
              stones.push({
                category: col1Val.toLowerCase().includes("melee") ? "melee" : "diamond",
                shape: col2Val,
                colorGrade: col7Val,
                clarityGrade: "",
                carat: col5Val,
                sourcing: "loose",
                certificateNumber: "",
                certificateLab: "",
                supplier: "",
                cost: costVal,
                notes: col3Val ? `Size: ${col3Val}` : ""
              });
            } else {
              extras.push({
                desc: col1Val ? `${col1Val} (${col2Val})` : col2Val,
                cost: costVal != null ? String(costVal) : ""
              });
            }
          }
        }
      }
      
      // Populate primary stone details from first stone
      let stoneShape = "";
      let stoneColor = "";
      let stoneCt = "";
      let stoneTotal = "";
      let stonePcs = "";
      let stoneMM = "";
      
      if (stones.length > 0) {
        const s = stones[0];
        stoneShape = s.shape;
        stoneColor = s.colorGrade;
        stoneCt = s.carat != null ? String(s.carat) : "";
        stoneTotal = s.cost != null ? String(s.cost) : "";
        stonePcs = s.pcs != null ? String(s.pcs) : "";
        stoneMM = s.notes ? s.notes.replace("Size: ", "") : "";
      }
      
      orders.push({
        id: projectNum,
        company: companyId,
        styleCode,
        productType: "Ring", // Default fallback
        metal,
        size: "",
        placedBy,
        status: "Inquiry", // Default fallback
        createdAt: projectDate || new Date().toISOString().slice(0, 10),
        
        castVendor,
        castInvoice,
        castDate,
        castGrams,
        castPrint,
        castTotal,
        
        stoneShape,
        stoneColor,
        stoneCt,
        stoneTotal,
        stonePcs,
        stoneMM,
        
        setter: setterName,
        setInvoice,
        setDate,
        setPrice,
        setJob,
        
        stones,
        extras,
        notes: clientName ? `Client: ${clientName}` : ""
      });
      
      r = Math.max(r + 25, setHdr + 2);
    } else {
      r++;
    }
  }
  
  return orders;
}

// Normalized headers helper and mapping map to allow robust imports from various flat sheets.
function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // remove spaces, underscores, symbols
}

const NORMALIZED_HEADER_TO_FIELD: Record<string, string> = {
  orderid: "id",
  orderno: "id",
  id: "id",
  ord: "id",
  stylecode: "styleCode",
  style: "styleCode",
  styleno: "styleCode",
  stylecodeorig: "styleCode",
  producttype: "productType",
  item: "productType",
  product: "productType",
  type: "productType",
  status: "status",
  placedby: "placedBy",
  user: "placedBy",
  placer: "placedBy",
  createdat: "createdAt",
  date: "createdAt",
  orderdate: "createdAt",
  metal: "metal",
  karat: "metal",
  metaltype: "metal",
  size: "size",
  ringsize: "size",
  castvendor: "castVendor",
  caster: "castVendor",
  castingvendor: "castVendor",
  castinvoice: "castInvoice",
  castinginvoice: "castInvoice",
  castdate: "castDate",
  casttotal: "castTotal",
  castingcost: "castTotal",
  castingtotal: "castTotal",
  setter: "setter",
  settingvendor: "setter",
  setinvoice: "setInvoice",
  settinginvoice: "setInvoice",
  setdate: "setDate",
  settotal: "setTotal",
  settingcost: "setTotal",
  settingtotal: "setTotal",
  stoneshape: "stoneShape",
  shape: "stoneShape",
  stonesizemm: "stoneMM",
  stonesize: "stoneMM",
  stonemm: "stoneMM",
  mm: "stoneMM",
  stonepcs: "stonePcs",
  pcs: "stonePcs",
  qty: "stonePcs",
  stoneqty: "stonePcs",
  stonect: "stoneCt",
  carats: "stoneCt",
  ct: "stoneCt",
  cts: "stoneCt",
  stonetotal: "stoneTotal",
  stonecost: "stoneTotal",
  notes: "notes",
  comments: "notes",
  description: "notes",
};

const NUMERIC_FIELDS = new Set([
  "castTotal",
  "setTotal",
  "stonePcs",
  "stoneCt",
  "stoneTotal",
]);

export async function parseOrdersFromWorkbook(buffer: Uint8Array): Promise<ImportedOrder[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  
  const allOrders: ImportedOrder[] = [];
  let parsedAny = false;
  
  for (const sheet of wb.worksheets) {
    let isProjectSheet = false;
    for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
      if (cellStr(sheet.getRow(r).getCell(1)) === "Project Number") {
        isProjectSheet = true;
        break;
      }
    }
    
    if (isProjectSheet) {
      const coId = sheet.name.toLowerCase().includes("sakk") ? "sakk" : "lgb";
      const orders = parseProjectBlocksSheet(sheet, coId);
      allOrders.push(...orders);
      parsedAny = true;
    }
  }
  
  if (parsedAny) {
    for (const o of allOrders) {
      const p = (o.placedBy || "").trim().toLowerCase();
      if (p === "sagar") {
        o.company = "sakk";
      } else if (p === "khushi" || p === "kunal" || p === "shweta") {
        o.company = "lgb";
      }
    }
    return allOrders;
  }
  
  // Fallback to legacy cards sheet
  const sheet = wb.getWorksheet("Cards") || wb.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const colField: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const raw = cellStr(cell);
    const key = normalizeHeader(raw);
    const field = NORMALIZED_HEADER_TO_FIELD[key];
    if (field) colField[col] = field;
  });
  if (Object.keys(colField).length === 0) return [];

  const orders: ImportedOrder[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const order: ImportedOrder = {};
    let hasData = false;
    for (const [colStr, field] of Object.entries(colField)) {
      const raw = cellStr(row.getCell(Number(colStr))).trim();
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

  for (const o of orders) {
    const p = (o.placedBy || "").trim().toLowerCase();
    if (p === "sagar") {
      o.company = "sakk";
    } else if (p === "khushi" || p === "kunal" || p === "shweta") {
      o.company = "lgb";
    }
  }

  return orders;
}
