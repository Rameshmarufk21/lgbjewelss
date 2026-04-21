import { NextResponse } from "next/server";
import { heuristicInvoiceFromOcr } from "@/lib/extraction/heuristicFromOcr";
import { ocrImageBuffer } from "@/lib/extraction/ocrTesseract";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ScanType = "casting" | "setting" | "memo" | "spec";
type PreviewImage = { imageData: string; mimeType: string };

function fromInvoiceLike(parsed: Record<string, unknown>, scanType: ScanType): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const vendorRaw = typeof parsed.vendor === "string" ? parsed.vendor : null;
  const vendor = normalizeVendor(vendorRaw);
  const invoiceNo = typeof parsed.invoice_no === "string" ? parsed.invoice_no : null;
  const invoiceDate = typeof parsed.invoice_date === "string" ? parsed.invoice_date : null;
  const total = typeof parsed.total === "number" ? parsed.total : null;
  const grams = typeof parsed.gold_weight_g === "number" ? parsed.gold_weight_g : null;
  const dwt =
    typeof parsed.metal_weight_dwt === "number" && Number.isFinite(parsed.metal_weight_dwt)
      ? parsed.metal_weight_dwt
      : null;
  const printFee =
    typeof parsed.print_fee === "number" && Number.isFinite(parsed.print_fee) ? parsed.print_fee : null;
  const notes = typeof parsed.product_ref === "string" ? parsed.product_ref : null;
  const metalHint = typeof parsed.metal === "string" ? parsed.metal.replace(/\s+/g, " ").trim() : null;
  const styleHint = typeof parsed.style_code === "string" ? parsed.style_code.replace(/\s+/g, " ").trim() : null;

  if (metalHint) out.metal = metalHint;
  if (styleHint) out.styleCode = styleHint.toUpperCase();

  if (scanType === "setting") {
    if (vendor) out.setter = vendor;
    if (invoiceNo) out.setInvoice = invoiceNo;
    if (invoiceDate) out.setDate = invoiceDate;
    if (total != null) out.setTotal = String(total);
  } else {
    if (vendor) out.castVendor = vendor;
    if (invoiceNo) out.castInvoice = invoiceNo;
    if (invoiceDate) out.castDate = invoiceDate;
    if (total != null) out.castTotal = String(total);
    if (grams != null) out.castGrams = String(grams);
    if (dwt != null) out.castDWT = String(dwt);
    if (printFee != null) out.castPrint = String(printFee);
  }

  if (notes) out.notes = notes;

  const lineItemsRaw = Array.isArray(parsed.line_items) ? parsed.line_items : [];
  const line_items = lineItemsRaw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const description = typeof r.description === "string" ? r.description : null;
      const amount = typeof r.amount === "number" ? r.amount : null;
      if (!description) return null;
      return { description, amount };
    })
    .filter(Boolean);
  if (line_items.length) out.line_items = line_items;

  return out;
}

function normalizeVendor(vendor: string | null): string | null {
  if (!vendor) return null;
  const v = vendor.replace(/\s+/g, " ").trim();
  if (/\bmta\b/i.test(v) && /\bcast/i.test(v)) return "MTA Casting Hub LLC";
  if (/\bmc\b/i.test(v) && /\bproduction\b/i.test(v)) return "MC Production";
  if (/^re\s+pe\s+er/i.test(v)) return "MTA Casting Hub LLC";
  return v;
}

function parseSpecFromOcr(ocrText: string): Record<string, unknown> {
  const t = ocrText.replace(/\r/g, "\n");
  const out: Record<string, unknown> = {};

  const styleCode =
    t.match(/\b(SFR-?\d{1,4}|SFE-?\d{1,4}|SFRBR-?\d{1,4}|SFPN-?\d{1,4}|SF\w{1,5}-?\d{1,4})\b/i)?.[1] ??
    null;
  const size = t.match(/\b([0-9]+(?:\.[0-9]+)?)\s*US\b/i)?.[1] ?? null;
  const metal =
    t.match(/\b(Platinum|14K(?:\s+\w+){0,2}|18K(?:\s+\w+){0,2}|10K(?:\s+\w+){0,2}|Silver)\b/i)?.[1] ??
    null;
  const shape = t.match(/\b(RND|Round|Marquise|Oval|Pear|Princess|EM|Emerald)\b/i)?.[1] ?? null;
  const mm = t.match(/\b([0-9]+(?:\.[0-9]+)?)\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*MM\b/i);
  const pcs = t.match(/\(\s*([0-9]{1,4})\s*PCS?\s*\)/i)?.[1] ?? t.match(/\bQTY\.?\s*([0-9]{1,4})\b/i)?.[1] ?? null;
  const ct = t.match(/\bTOTAL\s+([0-9]+(?:\.[0-9]+)?)\b/i)?.[1] ?? null;

  if (styleCode) out.styleCode = styleCode.toUpperCase();
  if (size) out.size = size;
  if (metal) out.metal = metal;
  if (shape) out.stoneShape = /^RND$/i.test(shape) ? "Round" : shape;
  if (pcs) out.stonePcs = pcs;
  if (ct) out.stoneCt = ct;
  if (mm) out.stoneMM = `${mm[1]}x${mm[2]}`;
  out.productType = "Ring";
  return out;
}

function normalizeScanType(value: unknown): ScanType {
  const x = typeof value === "string" ? value : "";
  if (x === "casting" || x === "setting" || x === "memo" || x === "spec") return x;
  return "casting";
}

function normalizeImages(body: Record<string, unknown>): PreviewImage[] {
  const single =
    typeof body.imageData === "string" && body.imageData
      ? [{ imageData: body.imageData, mimeType: typeof body.mimeType === "string" ? body.mimeType : "image/jpeg" }]
      : [];
  if (!Array.isArray(body.images)) return single;
  const many = body.images
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const imageData = typeof r.imageData === "string" ? r.imageData : "";
      const mimeType = typeof r.mimeType === "string" ? r.mimeType : "image/jpeg";
      if (!imageData) return null;
      return { imageData, mimeType };
    })
    .filter(Boolean) as PreviewImage[];
  return many.length ? many : single;
}

/**
 * Merges `incoming` into `base`: each scalar uses `base` when set; `incoming` only fills blanks.
 * `line_items`: by default both lists are merged and deduped. When `preferBaseLineItems` is true
 * and `base` already has line rows, OCR/heuristic rows are ignored so bad OCR line parsing cannot
 * sit beside a good Gemini table.
 */
function mergeExtracted(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
  opts?: { preferBaseLineItems?: boolean },
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === "line_items") continue;
    if (out[k] == null || out[k] === "") out[k] = v;
  }
  const a = Array.isArray(base.line_items) ? base.line_items : [];
  const b = Array.isArray(incoming.line_items) ? incoming.line_items : [];
  if (opts?.preferBaseLineItems && a.length) {
    out.line_items = a;
  } else if (a.length || b.length) {
    const seen = new Set<string>();
    out.line_items = [...a, ...b].filter((x) => {
      if (!x || typeof x !== "object") return false;
      const r = x as Record<string, unknown>;
      const d = String(r.description ?? "");
      const amt = r.amount == null ? "null" : String(r.amount);
      const key = `${d}|${amt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return out;
}

function parseJsonFromModelText(text: string): Record<string, unknown> | null {
  const t = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceScalarString(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (!t) return undefined;
    const n = Number(t);
    if (Number.isFinite(n) && /^-?\d/.test(t)) return String(n);
    return t;
  }
  return undefined;
}

/** Map Gemini / model JSON into stable form field names and string values. */
function normalizeGeminiOrderPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const aliasPairs: [string, string[]][] = [
    ["castDWT", ["cast_dwt", "dwt", "weightDwt", "metalDwt", "pennyweight"]],
    ["castGrams", ["cast_grams", "grams", "goldGrams", "weightGrams", "gold_weight_g", "metalGrams"]],
    ["castPrint", ["cast_print", "printFee", "print_fee", "cadFee", "cad_fee", "modelFee"]],
    ["castTotal", ["cast_total", "castingTotal", "invoiceTotal"]],
    ["castInvoice", ["cast_invoice", "invoiceNumber", "invoice_no"]],
    ["castDate", ["cast_date", "invoiceDate", "invoice_date"]],
    ["castVendor", ["cast_vendor", "vendor", "vendorName"]],
    ["metal", ["metalType", "goldType", "material", "karat", "metal_type"]],
    ["stonePcs", ["stone_pcs", "pcs", "qty", "quantity"]],
    ["stoneCt", ["stone_ct", "carats", "totalCt", "tcw"]],
    ["stonePrice", ["stone_price", "pricePerCt", "price_per_ct"]],
    ["stoneTotal", ["stone_total", "stoneCost"]],
    ["setPrice", ["set_price", "settingPrice"]],
    ["setLabor", ["set_labor", "labor"]],
    ["setLaser", ["set_laser", "laser"]],
    ["setTotal", ["set_total"]],
  ];
  for (const [canonical, alts] of aliasPairs) {
    const cur = out[canonical];
    const empty = cur == null || cur === "" || (typeof cur === "string" && !String(cur).trim());
    if (!empty) continue;
    for (const a of alts) {
      const v = out[a];
      if (v != null && v !== "" && !(typeof v === "string" && !String(v).trim())) {
        out[canonical] = v;
        break;
      }
    }
  }

  const numericKeys = [
    "castDWT",
    "castGrams",
    "castPrint",
    "castTotal",
    "setPrice",
    "setLabor",
    "setLaser",
    "setTotal",
    "setST",
    "stonePcs",
    "stoneCt",
    "stonePrice",
    "stoneTotal",
  ];
  for (const k of numericKeys) {
    const c = coerceScalarString(out[k]);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

function deriveCastPrintFromLineItems(extracted: Record<string, unknown>): void {
  const cur = extracted.castPrint;
  if (cur != null && cur !== "" && !(typeof cur === "string" && !cur.trim())) return;
  const lines = extracted.line_items;
  if (!Array.isArray(lines)) return;
  const styleCode =
    typeof extracted.styleCode === "string" && extracted.styleCode.trim() ? extracted.styleCode.trim() : null;
  const escStyle = styleCode ? styleCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  const styleScoped =
    escStyle == null
      ? []
      : lines.filter((li) => {
          if (!li || typeof li !== "object") return false;
          const d = String((li as Record<string, unknown>).description ?? "");
          return new RegExp(`\\b${escStyle}\\b`, "i").test(d);
        });
  const source = styleScoped.length ? styleScoped : lines;
  for (const li of source) {
    if (!li || typeof li !== "object") continue;
    const r = li as Record<string, unknown>;
    const d = String(r.description ?? "").toLowerCase();
    if (!/\b(print|printing|cad|3d|wax|model|sprue|tree)\b/.test(d)) continue;
    if (/\b(total|subtotal|tax|balance|due|invoice)\b/.test(d)) continue;
    const a = r.amount;
    if (typeof a === "number" && Number.isFinite(a) && a >= 0 && a < 1e6) {
      extracted.castPrint = String(a);
      return;
    }
  }
}

function alignStyleAndNotes(extracted: Record<string, unknown>): void {
  const style =
    typeof extracted.styleCode === "string" && extracted.styleCode.trim()
      ? extracted.styleCode.trim().toUpperCase()
      : null;
  if (!style) return;
  if (typeof extracted.notes !== "string") return;
  const notes = extracted.notes.trim();
  if (!notes) return;
  const styleTokens = [...notes.matchAll(/\b([A-Z]{2,6}-?\d{1,4}[A-Z]?)\b/g)].map((m) => m[1].toUpperCase());
  if (!styleTokens.length) return;
  if (styleTokens.includes(style)) return;
  if (!styleTokens.some((x) => x !== style)) return;
  const cleaned = notes.replace(/\b([A-Z]{2,6}-?\d{1,4}[A-Z]?)\b/g, "").replace(/\s+/g, " ").trim();
  extracted.notes = cleaned || `Auto note from invoice (${style})`;
}

/** Regex hints on full OCR text to fill gaps (matches detail card fields). */
function enrichExtractedFromJoinedOcr(joinedOcr: string, scanType: ScanType, extracted: Record<string, unknown>): void {
  if (scanType === "spec" || scanType === "memo") return;
  const t = joinedOcr.replace(/\r/g, "\n");
  const fill = (k: string, v: string | null | undefined) => {
    if (v == null || !String(v).trim()) return;
    if (extracted[k] == null || extracted[k] === "") extracted[k] = v.trim();
  };

  fill(
    "stonePcs",
    t.match(/\b(?:qty|pcs|pieces?)\s*[.:]?\s*([0-9]{1,4})\b/i)?.[1] ??
      t.match(/\b([0-9]{1,4})\s*(?:PCS|PIECES)\b/i)?.[1],
  );
  fill(
    "stoneCt",
    t.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:CT|CARATS?|TCW)\b/i)?.[1] ??
      t.match(/\b(?:total|ttl)\s*(?:ct|carats?)\s*[.:]?\s*([0-9]+(?:\.[0-9]+)?)\b/i)?.[1],
  );
  fill("stoneMM", t.match(/\b([0-9]+(?:\.[0-9]+)?\s*x\s*[0-9]+(?:\.[0-9]+)?)\s*MM\b/i)?.[1]);
  fill("stoneLot", t.match(/\b(?:lot|batch)\s*#?\s*:?\s*([A-Z0-9-]{2,})\b/i)?.[1]);
  fill("castPickup", t.match(/\b(?:picked\s*up|pickup)\s*(?:by)?\s*[.:]?\s*([A-Za-z][A-Za-z\s]{1,40})/i)?.[1]);
  fill(
    "linkedOrderId",
    t.match(/\b(?:rework|prior|link(?:ed)?|ref)\s*(?:order)?\s*[.:]?\s*(ORD-[0-9]+)\b/i)?.[1],
  );

  fill(
    "castGrams",
    t.match(/\bwt\.?\s*\(\s*grams?\s*\)\s*[:#.]?\s*(\d+(?:\.\d+)?)/i)?.[1] ??
      t.match(
      /\b(?:gold|metal|mount(?:ing)?|finish(?:ed)?|net|gross|cast(?:ing)?|tree|sprue)\s*(?:weight|wt)?\s*[:#.\s-]{0,12}(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b/i,
    )?.[1] ??
      t.match(/\b(?:wt|weight)\s*[:#.\s-]{0,8}(\d+(?:\.\d+)?)\s*(?:g|gm|gr)\b/i)?.[1],
  );
  fill(
    "castDWT",
    t.match(/\bwt\.?\s*\(\s*dwt\s*\)\s*[:#.]?\s*(\d+(?:\.\d+)?)/i)?.[1] ??
      t.match(
      /\b(?:gold|metal|mount(?:ing)?|net|gross|cast(?:ing)?|tree|sprue)?\s*(?:weight|wt)?\s*[:#.\s-]{0,12}(\d+(?:\.\d+)?)\s*(?:DWT|d\.?\s*w\.?\s*t\.?|P\.?W\.?T\.?)\b/i,
    )?.[1] ??
      t.match(/\bDWT\s*[/:=]\s*(\d+(?:\.\d+)?)\b/i)?.[1],
  );
  fill(
    "metal",
    t.match(
      /\b(Platinum|14K\s+White\s+Gold|14K\s+Yellow\s+Gold|14K\s+Rose\s+Gold|18K\s+White\s+Gold|18K\s+Yellow\s+Gold|18K\s+Rose\s+Gold|10K\s+White\s+Gold|Sterling\s+Silver|Silver)\b/i,
    )?.[1],
  );
  fill("metal", t.match(/\b(14KW|14KY|14KWG|18KW|18KYG|PT950|PT900)\b/i)?.[1]);
}

/** Second pass: line-item descriptions often hold DWT / g / metal per style row. */
function backfillWeightsAndMetalFromLineItems(extracted: Record<string, unknown>): void {
  const lines = extracted.line_items;
  if (!Array.isArray(lines)) return;
  const fill = (k: string, v: string | null | undefined) => {
    if (v == null || !String(v).trim()) return;
    if (extracted[k] == null || extracted[k] === "") extracted[k] = v.trim();
  };
  for (const li of lines) {
    if (!li || typeof li !== "object") continue;
    const desc = String((li as { description?: string }).description ?? "");
    fill("castGrams", desc.match(/\b(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b/i)?.[1]);
    fill("castDWT", desc.match(/\b(\d+(?:\.\d+)?)\s*(?:DWT|dwt|d\.?\s*w\.?\s*t\.?)\b/i)?.[1]);
    fill(
      "metal",
      desc.match(
        /\b(Platinum|14K\s+White\s+Gold|14K\s+Yellow\s+Gold|14K\s+Rose\s+Gold|18K\s+White\s+Gold|18K\s+Yellow\s+Gold|10K\s+White\s+Gold|Silver|14KW|14KY|18KW|PT950|PT900)\b/i,
      )?.[1],
    );
  }
}

/** Match `<select>` option labels in `public/orders-app/index.html`. */
function normalizeExtractedForOrderForm(extracted: Record<string, unknown>): void {
  const str = (k: string): string | undefined => {
    const v = extracted[k];
    if (typeof v !== "string") return undefined;
    const s = v.replace(/\s+/g, " ").trim();
    return s || undefined;
  };

  const v = str("castVendor");
  if (v) {
    if (/\bmta\b/i.test(v) && /cast/i.test(v)) extracted.castVendor = "MTA Casting Hub";
    else if (/\bcarat\b/i.test(v) && v.length < 20) extracted.castVendor = "CARAT";
  }

  const setter = str("setter");
  if (setter) {
    if (/mc\s*production/i.test(setter)) extracted.setter = "MC Production";
    else if (/^victor\b/i.test(setter)) extracted.setter = "Victor";
    else if (/jymp/i.test(setter)) extracted.setter = "JYMP";
    else if (/^edwin\b/i.test(setter)) extracted.setter = "Edwin";
  }

  const placed = str("placedBy");
  if (placed) {
    const p = placed.toLowerCase();
    if (["kunal", "sagar", "shweta", "khushi"].includes(p)) {
      extracted.placedBy = placed.charAt(0).toUpperCase() + placed.slice(1).toLowerCase();
    }
  }

  const st = str("status");
  if (st) {
    const canon = ["Inquiry", "Casting", "At Setter", "Hold", "Blocked", "Completed"].find(
      (x) => x.toLowerCase() === st.toLowerCase(),
    );
    if (canon) extracted.status = canon;
  }

  const metal = str("metal");
  if (metal) {
    const u = metal.replace(/\s+/g, " ").toUpperCase();
    if (/\bPT950\b|\bPT900\b|\bPLAT(INUM)?\b/i.test(u) || u === "PT") extracted.metal = "Platinum";
    else if (/\b14KW\b|\b14KWG\b|\b14K\s*WG\b/i.test(u)) extracted.metal = "14K White Gold";
    else if (/\b14KY\b|\b14KYG\b|\b14K\s*YG\b/i.test(u)) extracted.metal = "14K Yellow Gold";
    else if (/\b18KW\b|\b18KWG\b|\b18K\s*WG\b/i.test(u)) extracted.metal = "18K White Gold";
    else if (/\b18KY\b|\b18KYG\b|\b18K\s*YG\b/i.test(u)) extracted.metal = "18K Yellow Gold";
    else if (/\bSTERLING\b/i.test(u)) extracted.metal = "Silver";
    else if (/\b14k\s*wg\b|\b14k\s*white\b/i.test(metal)) extracted.metal = "14K White Gold";
    else if (/\b14k\s*yg\b|\b14k\s*yellow\b/i.test(metal)) extracted.metal = "14K Yellow Gold";
    else if (/\b14k\s*rg\b|\b14k\s*rose\b/i.test(metal)) extracted.metal = "14K Rose Gold";
    else if (/\b18k\s*wg\b|\b18k\s*white\b/i.test(metal)) extracted.metal = "18K White Gold";
    else if (/\b18k\s*yg\b|\b18k\s*yellow\b/i.test(metal)) extracted.metal = "18K Yellow Gold";
    else if (/\b10k\s*white\b/i.test(metal)) extracted.metal = "10K White Gold";
    else if (metal.toLowerCase() === "plat" || /\bplatinum\b/i.test(metal)) extracted.metal = "Platinum";
    else if (/\bsilver\b/i.test(metal)) extracted.metal = "Silver";
  }

  const shape = str("stoneShape");
  if (shape) {
    if (/\brnd\b|^round\b/i.test(shape)) extracted.stoneShape = "Round (RND)";
    else if (/\bmq\b|^marquise\b/i.test(shape)) extracted.stoneShape = "Marquise (MQ)";
    else if (/^oval\b/i.test(shape)) extracted.stoneShape = "Oval";
    else if (/^pear\b/i.test(shape)) extracted.stoneShape = "Pear";
    else if (/^princess\b/i.test(shape)) extracted.stoneShape = "Princess";
    else if (/^cushion\b/i.test(shape)) extracted.stoneShape = "Cushion";
    else if (/^em(erald)?\b/i.test(shape)) extracted.stoneShape = "Emerald";
    else if (/^radiant\b/i.test(shape)) extracted.stoneShape = "Radiant";
    else if (/^baguette\b/i.test(shape)) extracted.stoneShape = "Baguette";
    else if (/^mixed\b/i.test(shape)) extracted.stoneShape = "Mixed";
  }

  const col = str("stoneColor");
  if (col) {
    const c = col.toLowerCase();
    if (c === "white" || /\bwhite\b/i.test(col)) extracted.stoneColor = "White (default)";
    else if (/\byellow\b/i.test(col)) extracted.stoneColor = "Yellow";
    else if (/\bpink\b/i.test(col)) extracted.stoneColor = "Pink";
    else if (/\bblue\b/i.test(col)) extracted.stoneColor = "Blue";
    else if (/\bgreen\b/i.test(col)) extracted.stoneColor = "Green";
    else if (/\bblack\b/i.test(col)) extracted.stoneColor = "Black";
    else if (/\bchampagne\b/i.test(col)) extracted.stoneColor = "Champagne";
  }

  const pt = str("productType");
  if (pt) {
    const x = pt.toLowerCase();
    if (/\bring\b/.test(x)) extracted.productType = "Ring";
    else if (/\bbracelet\b/.test(x)) extracted.productType = "Bracelet";
    else if (/\bearring/.test(x)) extracted.productType = "Earring";
    else if (/\bnecklace\b/.test(x)) extracted.productType = "Necklace";
    else if (/\bpendant\b/.test(x)) extracted.productType = "Pendant";
    else if (/\bbangle\b/.test(x)) extracted.productType = "Bangle";
  }
}

/** One Gemini call for all pages/images (fewer billed requests than per-image calls). */
async function geminiVisionExtractBatch(
  apiKey: string,
  images: PreviewImage[],
  scanType: ScanType,
): Promise<Record<string, unknown> | null> {
  if (!images.length) return null;

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const schema =
    scanType === "setting"
      ? `Return one JSON object with keys: setter, setInvoice, setDate, setTotal, setPrice, setLabor, setLaser, setJob, setST, styleCode, productType, metal, size, stoneShape, stoneColor, stoneSieve, stoneMM, stonePcs, stoneCt, stonePrice, stoneTotal, stoneLot, stoneCert, placedBy, status, linkedOrderId, notes, line_items (array of {description:string, amount:number|null}).`
      : scanType === "spec"
        ? `Return one JSON object with keys: styleCode, productType, metal, size, stoneShape, stoneMM, stonePcs, stoneCt, stoneColor, stoneSieve, notes.`
        : `Return one JSON object with keys: castVendor, castInvoice, castDate, castTotal, castDWT, castGrams, castPrint, castPickup, castPickupDate, styleCode, productType, metal, size, placedBy, status, stoneShape, stoneColor, stoneSieve, stoneMM, stonePcs, stoneCt, stonePrice, stoneTotal, stoneLot, stoneCert, setter, setInvoice, setDate, setPrice, setLabor, setLaser, setTotal, setJob, setST, linkedOrderId, notes, line_items (array of {description:string, amount:number|null} merging rows from every page).`;

  const multi =
    images.length > 1
      ? `You will receive ${images.length} images (pages or retakes of the same paperwork). Merge all visible facts into a single JSON. If later pages repeat or correct earlier values, prefer summary/footer totals and the clearest row for weights and print/CAD fees.`
      : "";

  const prompt = `You extract data from jewelry casting invoices, setter invoices, and CAD/spec images for LabGrownBox.
${multi}
Read every image carefully (tables, handwriting, stamps). ${schema}
Rules: dates as YYYY-MM-DD when possible; amounts as numbers without $; use null for unknown fields; line_items descriptions should include style code and metal when visible.
Casting: You must fill castDWT, castGrams, and metal whenever they appear (headers, footers, or line-item rows like "SFR-63 PLAT 9.37 DWT 14.2g"). castDWT = pennyweight; castGrams = gold/metal weight in grams; metal = full type (e.g. Platinum, 14K White Gold). castPrint = CAD/print fee only — not grand total (castTotal).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType || "image/jpeg",
        data: img.imageData,
      },
    });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${rawText.slice(0, 280)}`);
  }
  let outer: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    outer = JSON.parse(rawText) as typeof outer;
  } catch {
    throw new Error(`Gemini response not JSON: ${rawText.slice(0, 200)}`);
  }
  const text = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini empty content: ${rawText.slice(0, 240)}`);
  }
  const parsed = parseJsonFromModelText(text);
  if (!parsed) return null;
  return scanType === "spec" ? parsed : normalizeGeminiOrderPayload(parsed);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  /** Gemini key: server env only — never accept client-supplied keys. */
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";

  const images = normalizeImages(body);
  const scanType = normalizeScanType(body.scanType);

  if (!images.length) return NextResponse.json({ error: "imageData required" }, { status: 400 });
  if (scanType === "memo") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Memo OCR is disabled. Upload memo photos as references and enter stone details in the structured form.",
      },
      { status: 400 },
    );
  }

  try {
    let ocrMerged: Record<string, unknown> = {};
    let ocrJoined = "";
    for (const img of images) {
      const buf = Buffer.from(img.imageData, "base64");
      const ocrText = await ocrImageBuffer(buf);
      ocrJoined += `\n${ocrText}`;

      const ocrExtracted =
        scanType === "spec"
          ? parseSpecFromOcr(ocrText)
          : fromInvoiceLike(heuristicInvoiceFromOcr(ocrText) as Record<string, unknown>, scanType);

      ocrMerged = mergeExtracted(ocrMerged, ocrExtracted);
    }

    let extracted = { ...ocrMerged };
    let visionUsed: "gemini" | "none" = "none";

    if (geminiApiKey) {
      try {
        const gem = await geminiVisionExtractBatch(geminiApiKey, images, scanType);
        if (gem && Object.keys(gem).length) {
          visionUsed = "gemini";
          const gemLineCount = Array.isArray(gem.line_items) ? gem.line_items.length : 0;
          extracted = mergeExtracted(gem, ocrMerged, {
            preferBaseLineItems: gemLineCount > 0,
          });
        }
      } catch {
        /* OCR-only */
      }
    }

    if (scanType !== "spec") deriveCastPrintFromLineItems(extracted);
    enrichExtractedFromJoinedOcr(ocrJoined, scanType, extracted);
    if (scanType !== "spec") backfillWeightsAndMetalFromLineItems(extracted);
    normalizeExtractedForOrderForm(extracted);
    alignStyleAndNotes(extracted);

    return NextResponse.json({
      success: true,
      extracted,
      rawTextPreview: ocrJoined.slice(0, 400),
      imageCount: images.length,
      visionUsed,
      geminiCalls: geminiApiKey ? 1 : 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `OCR failed: ${msg}` }, { status: 500 });
  }
}
