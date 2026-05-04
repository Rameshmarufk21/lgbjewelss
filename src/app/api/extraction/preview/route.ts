/**
 * /api/extraction/preview — 3-layer AI invoice / CAD extraction.
 *
 * Copyright © 2026 LabGrownBox, Inc. All rights reserved.
 * Proprietary — see LICENSE in the repository root.
 *
 * Pipeline:
 *   1. Tesseract OCR + heuristic regex (free, fast, low-confidence)
 *   2. Document classifier — picks MTA / Carat / MC / CAD / findings prompt
 *   3. AI fan-out: Gemini 2.0 Flash → Gemini 1.5 Pro → Groq Llama Vision
 *      (best-scoring result wins)
 *   4. Post-processing — derives missing scalars from per-row fields,
 *      scrubs CAD noise, normalizes vendor names for the order form.
 */
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
      if (!description) return null;
      const pickNum = (k: string): number | null => {
        const v = r[k];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      const pickStr = (k: string): string | null => {
        const v = r[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      return {
        description,
        amount: pickNum("amount"),
        styleCode: pickStr("styleCode"),
        metal: pickStr("metal"),
        karat: pickStr("karat"),
        qty: pickNum("qty"),
        dwt: pickNum("dwt"),
        grams: pickNum("grams"),
        printFee: pickNum("printFee"),
        lineTotal: pickNum("lineTotal"),
      };
    })
    .filter(Boolean);
  if (line_items.length) out.line_items = line_items;

  return out;
}

/**
 * Fingerprint the image before calling AI: CAD spec images (karat pricing tables,
 * STYLE NO / SIZE / MM SIZE / stone lists) must NOT produce `line_items`. Everything
 * else is an invoice/memo and should get full line-item extraction.
 */
type DocumentKind =
  | "cad_spec"
  | "mta_casting"
  | "carat_casting"
  | "mc_setting"
  | "other_setting"
  | "findings"
  | "memo"
  | "invoice_generic"
  | "unknown";

function classifyDocumentFromText(ocrText: string): DocumentKind {
  const t = ocrText.replace(/\r/g, "\n");
  const u = t.toUpperCase();

  // CAD spec: karat pricing table (NT-10K/14K/18K/22K) OR style/size/MM grid with no $ invoice footer.
  const nt = /\bNT[-\s]?(10K|14K|18K|22K|24K|PLAT)/i.test(t);
  const styleBlock = /\bSTYLE\s*NO\b/i.test(u) && /\bSIZE\b/i.test(u);
  const mmGrid = /\bMM\s*SIZE\b/i.test(u) && /\bSTONE\s*(SIZE|TYPE|SHAPE)\b/i.test(u);
  const hasInvoiceFooter = /\bTOTAL\s*DUE\b/i.test(u) || /\bSUBTOTAL\b/i.test(u) || /\bINVOICE\s*(NO|#)\b/i.test(u);
  if ((nt || styleBlock || mmGrid) && !hasInvoiceFooter) return "cad_spec";

  // MTA Casting Hub (printed)
  if (/\bMTA\s+CAST(ING)?\s+HUB\b/i.test(t) || /\bMTA\s+CASTING\b/i.test(t)) return "mta_casting";

  // CARAT CAST LLC (printed) — look for CC- invoice prefix or explicit name
  if (/\bCARAT\s+CAST\b/i.test(t) || /\bCC-\d{3,}\b/i.test(t)) return "carat_casting";

  // MC Production (setting invoice)
  if (/\bMC\s+PRODUCTION\b/i.test(t)) return "mc_setting";

  // Memorandum (stone/diamond memos) — handwritten Phil's Stationery, Labgrown Box memo, etc.
  if (/\bMEMORANDUM\b/i.test(t) || /\bMEMO\s*NO\b/i.test(t) || /\bPHIL['’]S\s+STATIONERY\b/i.test(t)) return "memo";

  // Findings shops
  if (/\bGALLO\s+MOUNT/i.test(t) || /\bCROWN\s+FINDINGS\b/i.test(t) || /\bORANGE\s+FINDINGS\b/i.test(t) || /\bROSS\s+METALS\b/i.test(t) || /\bMOON\b.*\bFINDINGS\b/i.test(t)) return "findings";

  // Handwritten setter memo (no branded invoice)
  if (/\bLOT\s*NO\b/i.test(u) && /\bCARATS?\b/i.test(u) && /\bPRICE\s+PER\s+CARAT\b/i.test(u)) return "other_setting";

  if (hasInvoiceFooter) return "invoice_generic";
  return "unknown";
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

  // Style code on a CAD spec is ALWAYS the SF-family pattern. NT-* / karat names
  // (NT-14K, Platinum, Silver) are the price ladder, not style codes — reject them.
  const styleCode =
    t.match(/\b(SFR-?\d{1,4}[A-Z]?|SFE-?\d{1,4}[A-Z]?|SFRBR-?\d{1,4}[A-Z]?|SFPN-?\d{1,4}[A-Z]?|SFNP-?\d{1,4}[A-Z]?|SFHEAD-?\d{0,4}[A-Z]?|SFBR-?\d{1,4}[A-Z]?|BR-?\d{1,4}[A-Z]?|SF[A-Z]{1,5}-?\d{1,4}[A-Z]?)\b/i)?.[1] ??
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
      // Prefer a stable key on styleCode+qty+lineTotal when available; fall back to desc+amount.
      const style = typeof r.styleCode === "string" ? r.styleCode.toUpperCase() : "";
      const qty = r.qty == null ? "" : String(r.qty);
      const lt = r.lineTotal == null ? (r.amount == null ? "null" : String(r.amount)) : String(r.lineTotal);
      const d = String(r.description ?? "");
      const key = style ? `${style}|${qty}|${lt}` : `${d}|${lt}`;
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
  const isBlank = cur == null || cur === "" || (typeof cur === "string" && !cur.trim());
  const lines = extracted.line_items;
  if (!Array.isArray(lines) || !lines.length) return;

  // Preferred: first row's per-row printFee (set by enriched heuristic / AI).
  if (isBlank) {
    for (const li of lines) {
      if (!li || typeof li !== "object") continue;
      const r = li as Record<string, unknown>;
      const pf = r.printFee;
      if (typeof pf === "number" && Number.isFinite(pf) && pf >= 0 && pf < 1e6) {
        extracted.castPrint = String(pf);
        return;
      }
    }
  }

  if (!isBlank) {
    // Sanity check: if an existing scalar print is suspicious (e.g. "7") but a per-row
    // printFee of 70 exists for the same style, prefer the per-row value.
    const curNum = typeof cur === "number" ? cur : typeof cur === "string" ? Number(cur) : NaN;
    if (Number.isFinite(curNum) && curNum > 0 && curNum < 10) {
      for (const li of lines) {
        if (!li || typeof li !== "object") continue;
        const r = li as Record<string, unknown>;
        const pf = r.printFee;
        if (typeof pf === "number" && Number.isFinite(pf) && pf >= 10 && pf % 10 === 0) {
          extracted.castPrint = String(pf);
          return;
        }
      }
    }
    return;
  }

  // Description-based fallback (legacy): rows whose description mentions print/CAD/wax.
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

/**
 * Fill castDWT / castGrams / metal / styleCode from the first product row when
 * scalars are blank. This handles MTA invoices where the model got line_items
 * right but didn't surface per-product weights to the top.
 */
function deriveCastWeightsFromLineItems(extracted: Record<string, unknown>): void {
  const lines = extracted.line_items;
  if (!Array.isArray(lines) || !lines.length) return;

  const first = lines.find((li) => {
    if (!li || typeof li !== "object") return false;
    const r = li as Record<string, unknown>;
    return typeof r.dwt === "number" || typeof r.grams === "number" || typeof r.styleCode === "string";
  }) as Record<string, unknown> | undefined;
  if (!first) return;

  const fillIfBlank = (k: string, v: string | null) => {
    if (v == null || !v.trim()) return;
    const cur = extracted[k];
    if (cur == null || cur === "" || (typeof cur === "string" && !String(cur).trim())) extracted[k] = v;
  };

  if (typeof first.dwt === "number") fillIfBlank("castDWT", String(first.dwt));
  if (typeof first.grams === "number") fillIfBlank("castGrams", String(first.grams));
  if (typeof first.printFee === "number") fillIfBlank("castPrint", String(first.printFee));
  if (typeof first.styleCode === "string") fillIfBlank("styleCode", first.styleCode);
  if (typeof first.karat === "string") fillIfBlank("metal", first.karat);
  else if (typeof first.metal === "string") fillIfBlank("metal", first.metal);
}

/**
 * CAD specs sometimes leak NT-14K / Platinum / Silver into styleCode even though
 * those are the karat price ladder, not the part number. Reject them and try
 * again from raw text.
 */
function scrubCadSpec(extracted: Record<string, unknown>, joinedOcr: string): void {
  const sc = typeof extracted.styleCode === "string" ? extracted.styleCode.trim() : "";
  const looksLikeNoise =
    !sc ||
    /^NT[-\s]?\d{1,2}K?$/i.test(sc) ||
    /^(PLATINUM|SILVER|GOLD|10K|14K|18K|22K|24K)$/i.test(sc) ||
    /^(WHITE|YELLOW|ROSE)\s+GOLD$/i.test(sc);
  if (looksLikeNoise) {
    const m = joinedOcr.match(
      /\b(SFR-?\d{1,4}[A-Z]?|SFE-?\d{1,4}[A-Z]?|SFRBR-?\d{1,4}[A-Z]?|SFPN-?\d{1,4}[A-Z]?|SFNP-?\d{1,4}[A-Z]?|SFBR-?\d{1,4}[A-Z]?|BR-?\d{1,4}[A-Z]?|SF[A-Z]{1,5}-?\d{1,4}[A-Z]?)\b/i,
    );
    if (m) extracted.styleCode = m[1].toUpperCase();
    else delete extracted.styleCode;
  }
  // Metal is meaningless on a CAD spec — drop it so it can't poison the order form.
  if (extracted.metal && /^(NT-?\d{1,2}K?|10K|14K|18K|22K)$/i.test(String(extracted.metal).trim())) {
    delete extracted.metal;
  }

  // If `stones` array exists, ensure the scalar stoneShape/stoneMM/stonePcs reflect the CENTER stone.
  const stones = Array.isArray(extracted.stones) ? extracted.stones : [];
  if (stones.length) {
    const center =
      (stones.find((s) => {
        if (!s || typeof s !== "object") return false;
        const r = s as Record<string, unknown>;
        return typeof r.position === "string" && /center/i.test(r.position);
      }) as Record<string, unknown> | undefined) ?? (stones[0] as Record<string, unknown>);
    if (center && typeof center === "object") {
      if (!extracted.stoneShape && typeof center.shape === "string") extracted.stoneShape = center.shape;
      if (!extracted.stoneMM && typeof center.sizeMm === "string") extracted.stoneMM = center.sizeMm;
    }
    // If pcs / ct totals weren't provided, sum them.
    if (extracted.stonePcs == null) {
      const sum = stones.reduce((a, s) => {
        if (!s || typeof s !== "object") return a;
        const v = (s as Record<string, unknown>).pcs;
        return a + (typeof v === "number" && Number.isFinite(v) ? v : 0);
      }, 0);
      if (sum > 0) extracted.stonePcs = String(sum);
    }
    if (extracted.stoneCt == null) {
      const sum = stones.reduce((a, s) => {
        if (!s || typeof s !== "object") return a;
        const v = (s as Record<string, unknown>).caratTotal;
        return a + (typeof v === "number" && Number.isFinite(v) ? v : 0);
      }, 0);
      if (sum > 0) extracted.stoneCt = String(Math.round(sum * 1000) / 1000);
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

/**
 * Build the AI prompt. We specialize the schema / rules by `effectiveKind` so the
 * model gets precise instructions for MTA vs Carat vs MC vs CAD vs findings. The
 * same prompt is reused for all 3 AI layers (Gemini Pro → Gemini Flash → Groq)
 * for consistency.
 */
function buildExtractionPrompt(effectiveKind: DocumentKind, scanType: ScanType, imageCount: number): string {
  const multi =
    imageCount > 1
      ? `You will receive ${imageCount} images (multiple pages or retakes of the SAME paperwork). Merge facts into ONE JSON. Prefer footer/summary totals and the clearest row for per-product weights and print/CAD fees.`
      : "";

  if (effectiveKind === "cad_spec" || scanType === "spec") {
    return `You are reading a CAD / jewelry spec sheet for LabGrownBox (a single ring or piece design). ${multi}
This is NOT an invoice and there is exactly ONE piece on the page.

WHAT MATTERS (extract these):
  - styleCode: the SF-family code, e.g. SFR-63, SFE-22, SFRBR-8, SFPN-12, BR-09. ALWAYS this format: 2–6 letters, optional dash, 1–4 digits, optional letter suffix.
  - productType: Ring | Pendant | Earring | Bracelet | Necklace | Bangle
  - size: ring/finger size (US) when present
  - stones: an ARRAY — one entry per distinct stone position. Each stone needs:
      { "position": "Center | Side | Halo | Accent | Shoulder | ... or null",
        "shape": "Round (RND) | Marquise (MQ) | Emerald (EM) | Cushion | Asscher | Pear | Oval | Princess | Radiant | Baguette | Heart | Trillion",
        "sizeMm": "A or AxB in mm — e.g. \\"3\\" or \\"4x2\\" or \\"4.5\\"",
        "pcs": integer count for this size/shape,
        "caratEach": carats_per_stone_or_null,
        "caratTotal": total_carats_for_this_position_or_null }
  - notes: free-text summary of anything important the setter should see (gallery type, prong count, special features).

WHAT IS NOISE (IGNORE — never put these in styleCode):
  - "NT-10K", "NT-14K", "NT-18K", "NT-22K" — these are the price ladder for ONE ring, not style codes.
  - The words "Platinum", "Silver", "Gold", "10K", "14K", "18K", "22K" appearing in the karat table.
  - Any pricing column or dollar amount on the spec sheet.
  - Set "metal" to null on a CAD spec — metal will be picked at order time, not from the spec.

Return ONE JSON object:
{ "documentKind": "cad_spec",
  "styleCode": "SFR-...",
  "productType": "Ring|...",
  "metal": null,
  "size": "US size",
  "stones": [ { "position": "Center", "shape": "Round (RND)", "sizeMm": "5", "pcs": 1, "caratEach": 0.50, "caratTotal": 0.50 },
              { "position": "Halo", "shape": "Round (RND)", "sizeMm": "1.3", "pcs": 12, "caratEach": null, "caratTotal": null } ],
  "stoneShape": "shape of the CENTER stone (mirror of stones[0].shape) so the existing form fills",
  "stoneMM": "sizeMm of the CENTER stone",
  "stonePcs": total piece count across all positions,
  "stoneCt": grand total carat weight if shown,
  "stoneColor": null,
  "stoneSieve": null,
  "notes": "1-line summary for humans",
  "line_items": null }
Rules: numbers as numbers (no quotes); null for unknown — NEVER guess a style code. Output ONLY JSON — no code fences, no prose.`;
  }

  if (effectiveKind === "mta_casting") {
    return `You are reading an MTA CASTING HUB invoice for LabGrownBox. ${multi}
Columns: Metal | Description | Quantity | Wt(DWT)/Price | Wt(Grams)/Price | Print Fee | Total
Every DATA row in the body is ONE product card. There can be 1 to 20+ rows. Extract EVERY row — do not skip and do not merge.
For each row capture: styleCode (e.g. BR-09, SFR-63), metal ("Gold" or "Platinum"), karat ("14K Yellow", "18K White", "Platinum"), qty (integer), dwt (number from the DWT/price pair), grams (number from the Grams/price pair), printFee (number, integer like 70 — NOT 7), lineTotal (final $ on the row).
Set castDWT / castGrams / castPrint to the FIRST product row's values (they also appear in the per-row line_items). castTotal = footer Total Due.
Return ONE JSON object:
{ "documentKind": "mta_casting",
  "castVendor": "MTA Casting Hub", "castInvoice": "...", "castDate": "YYYY-MM-DD",
  "castTotal": number, "castDWT": number, "castGrams": number, "castPrint": number,
  "styleCode": "first row style", "productType": "Ring|...", "metal": "14K Yellow Gold|Platinum|...",
  "placedBy": null, "status": null, "notes": null,
  "line_items": [
    { "description": "full row text (clean)", "styleCode": "BR-09", "metal": "Gold|Platinum",
      "karat": "14K Yellow", "qty": 4, "dwt": 15.86, "grams": 24.58, "printFee": 70,
      "lineTotal": 2609.61, "amount": 2609.61 }
  ] }
Rules: numbers not strings, no $, no commas. If the print fee cell is blank, use null (do NOT pick stray digits). NEVER confuse the Gold/Platinum discount or "Metal Discount" rows with products. Output ONLY JSON.`;
  }

  if (effectiveKind === "carat_casting") {
    return `You are reading a CARAT CAST LLC invoice for LabGrownBox. ${multi}
Columns: LINE | PIECES | DESCRIPTION | STYLE NO | KT/METAL | WEIGHT(G) | LABOUR/G | RATE | WAX | LINE TOTAL.
Every data row is one product. RETURN lines have isReturn=true and a NEGATIVE lineTotal — still include them.
Return ONE JSON object:
{ "documentKind": "carat_casting",
  "castVendor": "CARAT", "castInvoice": "CC-...", "castDate": "YYYY-MM-DD",
  "castTotal": number, "castGrams": number, "castPrint": number, "castDWT": null,
  "styleCode": "first row style", "metal": "14K...|Platinum", "productType": "Ring|...",
  "placedBy": "Attention value if present", "notes": null,
  "line_items": [
    { "description": "clean row", "styleCode": "SFR-63", "metal": "Gold|Platinum",
      "karat": "14K Yellow", "qty": 2, "grams": 6.12, "printFee": waxFee_or_null,
      "lineTotal": 412.50, "amount": 412.50, "dwt": null }
  ] }
Every row counts, from 1 to 20+. Output ONLY JSON.`;
  }

  if (effectiveKind === "mc_setting" || scanType === "setting") {
    return `You are reading an MC PRODUCTION US LLC setter invoice (or similar setter paperwork). ${multi}
Columns (MC): Item | Description | Qty | ST# | Setting Price | Labor | Laser | Unit Price | Price.
Each DATA row is ONE product. Extract ALL of them.
Return ONE JSON object:
{ "documentKind": "mc_setting",
  "setter": "MC Production|Victor|JYMP|Edwin|...", "setInvoice": "...", "setDate": "YYYY-MM-DD",
  "setTotal": number, "setPrice": number, "setLabor": number, "setLaser": number,
  "styleCode": "first row style", "metal": null, "productType": "Ring|...",
  "line_items": [
    { "description": "clean row", "styleCode": "SFR-63", "qty": 1,
      "settingPrice": 25, "laborCost": 10, "laserCost": 5, "unitPrice": 40,
      "lineTotal": 40, "amount": 40 }
  ] }
Output ONLY JSON.`;
  }

  if (effectiveKind === "other_setting") {
    return `You are reading a handwritten setter memo (Phil's Stationery form) for LabGrownBox. ${multi}
Columns: LOT NO | PIECES | DESCRIPTION | CARATS | PRICE PER CARAT | TOTAL. The description may contain a style code.
Return ONE JSON object:
{ "documentKind": "other_setting",
  "setter": "name at TOP of memo (TO:)", "setInvoice": "memo NO", "setDate": "YYYY-MM-DD",
  "setTotal": number, "styleCode": "first row style if present",
  "notes": "free-text summary",
  "line_items": [
    { "description": "clean row", "styleCode": "SFR-63", "qty": 30,
      "carats": 1.20, "pricePerCarat": 40, "lineTotal": 48, "amount": 48 }
  ] }
If handwriting is unreadable, use null — NEVER guess numbers. Output ONLY JSON.`;
  }

  if (effectiveKind === "findings") {
    return `You are reading a FINDINGS vendor invoice (Gallo Mounting, Moon, Orange, Crown, Ross Metals, etc.) for LabGrownBox. ${multi}
Layouts vary. Extract all line items and totals.
Return ONE JSON object:
{ "documentKind": "findings",
  "castVendor": "vendor name", "castInvoice": "...", "castDate": "YYYY-MM-DD",
  "castTotal": number,
  "line_items": [ { "description": "...", "qty": n, "unitPrice": n, "lineTotal": n, "amount": n } ] }
Output ONLY JSON.`;
  }

  // Generic / unknown invoice — best-effort extraction
  return `You extract data from a jewelry invoice for LabGrownBox. ${multi}
Return ONE JSON object. Include castVendor, castInvoice, castDate, castTotal, castDWT, castGrams, castPrint, styleCode, productType, metal, size, placedBy, status, notes.
line_items: array of objects, one per DATA row in any table. For each row include description, styleCode, metal, karat, qty, dwt (if present), grams (if present), printFee (if present), lineTotal, amount.
Rules: dates YYYY-MM-DD; amounts as numbers (no $); null for unknown; do NOT treat karat-pricing sheets (NT-10K, NT-14K etc.) as separate products — those are one piece. Output ONLY JSON.`;
}

async function geminiExtract(
  apiKey: string,
  model: string,
  images: PreviewImage[],
  prompt: string,
): Promise<Record<string, unknown> | null> {
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
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
      },
    }),
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}: ${rawText.slice(0, 280)}`);
  let outer: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    outer = JSON.parse(rawText) as typeof outer;
  } catch {
    throw new Error(`Gemini ${model} response not JSON: ${rawText.slice(0, 200)}`);
  }
  const text = outer.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return parseJsonFromModelText(text);
}

async function groqExtract(
  apiKey: string,
  images: PreviewImage[],
  prompt: string,
): Promise<Record<string, unknown> | null> {
  if (!images.length) return null;
  // Groq vision supports one image per message — use the first/primary page.
  const primary = images[0];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${primary.mimeType || "image/jpeg"};base64,${primary.imageData}` },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0,
    }),
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${rawText.slice(0, 280)}`);
  let outer: { choices?: { message?: { content?: string } }[] };
  try {
    outer = JSON.parse(rawText) as typeof outer;
  } catch {
    throw new Error(`Groq response not JSON: ${rawText.slice(0, 200)}`);
  }
  const text = outer.choices?.[0]?.message?.content;
  if (!text) return null;
  return parseJsonFromModelText(text);
}

/**
 * Scores a raw AI extraction result: higher = more complete. Used to pick between
 * 3-layer fallbacks. An extraction with proper per-row line_items beats one that
 * only filled scalar fields.
 */
function scoreExtraction(x: Record<string, unknown> | null, kind: DocumentKind): number {
  if (!x) return 0;
  let s = 0;
  if (typeof x.castVendor === "string" || typeof x.setter === "string") s += 1;
  if (typeof x.castInvoice === "string" || typeof x.setInvoice === "string") s += 1;
  if (typeof x.castTotal === "number" || typeof x.setTotal === "number") s += 1;
  if (typeof x.styleCode === "string") s += 1;
  const lines = Array.isArray(x.line_items) ? x.line_items : [];
  if (kind === "cad_spec") {
    // CAD spec should NOT have line_items — fewer/empty is better.
    return s + (lines.length === 0 ? 3 : 0);
  }
  if (lines.length) {
    s += 2;
    // Extra credit for per-row structured fields (dwt/grams/printFee/lineTotal).
    let enriched = 0;
    for (const li of lines) {
      if (!li || typeof li !== "object") continue;
      const r = li as Record<string, unknown>;
      if (typeof r.dwt === "number") enriched++;
      if (typeof r.grams === "number") enriched++;
      if (typeof r.printFee === "number") enriched++;
      if (typeof r.lineTotal === "number" || typeof r.amount === "number") enriched++;
      if (typeof r.styleCode === "string") enriched++;
    }
    s += Math.min(enriched / Math.max(lines.length, 1), 5);
  }
  return s;
}

/**
 * 3-layer AI extraction for maximum accuracy. Runs Gemini 2.0 Flash FIRST (fast +
 * cheapest), then escalates to Gemini 1.5 Pro if the first pass looks weak, then
 * finally falls back to Groq Llama Vision. We KEEP the best-scoring result. The
 * same prompt (specialized by `effectiveKind`) is used for all three.
 */
async function layeredAiExtract(
  geminiKey: string,
  groqKey: string,
  images: PreviewImage[],
  scanType: ScanType,
  effectiveKind: DocumentKind,
): Promise<{ result: Record<string, unknown> | null; layersUsed: string[]; errors: string[] }> {
  const prompt = buildExtractionPrompt(effectiveKind, scanType, images.length);
  const layersUsed: string[] = [];
  const errors: string[] = [];
  let best: { raw: Record<string, unknown> | null; score: number; layer: string } = { raw: null, score: 0, layer: "" };

  const consider = (layer: string, raw: Record<string, unknown> | null) => {
    const normalized = raw ? (scanType === "spec" || effectiveKind === "cad_spec" ? raw : normalizeGeminiOrderPayload(raw)) : null;
    const sc = scoreExtraction(normalized, effectiveKind);
    if (sc > best.score) best = { raw: normalized, score: sc, layer };
  };

  // Layer 1: Gemini 2.0 Flash (fast default)
  if (geminiKey) {
    try {
      const flashModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
      const r = await geminiExtract(geminiKey, flashModel, images, prompt);
      layersUsed.push(`gemini:${flashModel}`);
      consider(`gemini:${flashModel}`, r);
    } catch (e) {
      errors.push(`gemini-flash: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Layer 2: Gemini 1.5 Pro — only if Layer 1 looks weak or missing line_items for an invoice.
  const needsPro =
    effectiveKind !== "cad_spec" &&
    (best.score < 5 ||
      !Array.isArray(best.raw?.line_items) ||
      (Array.isArray(best.raw?.line_items) && best.raw!.line_items.length === 0));
  if (geminiKey && needsPro) {
    try {
      const r = await geminiExtract(geminiKey, "gemini-1.5-pro", images, prompt);
      layersUsed.push("gemini:1.5-pro");
      consider("gemini:1.5-pro", r);
    } catch (e) {
      errors.push(`gemini-pro: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Layer 3: Groq Llama Vision — last-resort fallback, but also a useful tiebreaker on handwriting.
  const groqUseful = effectiveKind !== "cad_spec" && best.score < 4;
  if (groqKey && groqUseful) {
    try {
      const r = await groqExtract(groqKey, images, prompt);
      layersUsed.push("groq:llama-3.2-11b-vision");
      consider("groq:llama-3.2-11b-vision", r);
    } catch (e) {
      errors.push(`groq: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { result: best.raw, layersUsed, errors };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  /** AI keys: server env only — never accept client-supplied keys. */
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const groqApiKey = process.env.GROQ_API_KEY?.trim() || "";

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

    // Classify the document BEFORE asking the model, so we can send a
    // specialized prompt (MTA vs Carat vs MC vs CAD vs findings) and later
    // suppress line_items for CAD spec images.
    const heuristicKind = classifyDocumentFromText(ocrJoined);
    const effectiveKind: DocumentKind =
      scanType === "spec" ? "cad_spec" : heuristicKind === "unknown" ? (scanType === "setting" ? "other_setting" : "invoice_generic") : heuristicKind;

    let extracted = { ...ocrMerged };
    let visionUsed: "ai" | "none" = "none";
    let layersUsed: string[] = [];
    let aiErrors: string[] = [];

    if (geminiApiKey || groqApiKey) {
      const ai = await layeredAiExtract(geminiApiKey, groqApiKey, images, scanType, effectiveKind);
      layersUsed = ai.layersUsed;
      aiErrors = ai.errors;
      if (ai.result && Object.keys(ai.result).length) {
        visionUsed = "ai";
        const aiLineCount = Array.isArray(ai.result.line_items) ? (ai.result.line_items as unknown[]).length : 0;
        extracted = mergeExtracted(ai.result, ocrMerged, {
          preferBaseLineItems: aiLineCount > 0,
        });
      }
    }

    // For CAD spec images the line_items array is noise (karat pricing rows, not products).
    // Force-suppress it regardless of which layer picked it up. Also reject NT-/karat
    // bleed-through into styleCode and metal.
    if (effectiveKind === "cad_spec" || scanType === "spec") {
      delete extracted.line_items;
      scrubCadSpec(extracted, ocrJoined);
    }

    if (scanType !== "spec") {
      deriveCastPrintFromLineItems(extracted);
      deriveCastWeightsFromLineItems(extracted);
    }
    enrichExtractedFromJoinedOcr(ocrJoined, scanType, extracted);
    if (scanType !== "spec") backfillWeightsAndMetalFromLineItems(extracted);
    normalizeExtractedForOrderForm(extracted);
    alignStyleAndNotes(extracted);

    // Surface the detected document kind so the UI can label it ("CAD spec" vs "Invoice").
    if (!extracted.documentKind) extracted.documentKind = effectiveKind;

    return NextResponse.json({
      success: true,
      extracted,
      documentKind: effectiveKind,
      rawTextPreview: ocrJoined.slice(0, 400),
      imageCount: images.length,
      visionUsed,
      layersUsed,
      aiErrors: aiErrors.length ? aiErrors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `OCR failed: ${msg}` }, { status: 500 });
  }
}
