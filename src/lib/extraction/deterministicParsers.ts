import "server-only";

/**
 * No-AI, deterministic parsers for the printed, fixed-format documents (MTA
 * casting invoice + CAD/spec sheet). They run on Tesseract OCR text — free,
 * instant, no quotas. Handwritten memos are NOT handled here (manual entry / AI).
 */
type Dict = Record<string, unknown>;

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Reject the karat net-weight ladder (NT-10K, NW-14K, INT-14K from OCR, …),
// bare karats (14K), and N/A — none of these are real style codes.
const KARAT_LADDER = /^(I?N[TW]-?\d{1,2}K|\d{1,2}K|N\/?A)$/i;

function styleFrom(text: string): string | null {
  // Prefer the SF-family code (SFR-120, SFER-22, SFR-109-A, SFRBR-8…). The
  // optional trailing "-A"/"-B" letter suffix must be kept (SFR-109-A ≠ SFR-109).
  const sf = text.match(/\b(SF[A-Z]{0,3}-?\d{1,4}(?:-?[A-Z])?)\b/i);
  if (sf) return sf[1].toUpperCase();
  // Otherwise the first plausible code that is NOT a karat-ladder entry.
  const candidates = [...text.matchAll(/\b([A-Z]{2,5}-?\d{2,4}(?:-?[A-Z])?)\b/g)].map((m) => m[1]);
  const good = candidates.find((c) => !KARAT_LADDER.test(c) && !/^I?N[TW]/i.test(c));
  return good ? good.toUpperCase() : null;
}

function productTypeFromStyle(style: string | null): string {
  const s = (style || "").toUpperCase();
  if (/SFE|SFER|EARRING/.test(s)) return "Earring";
  if (/SFRBR|SFBR|BRACELET|BANGLE/.test(s)) return "Bracelet";
  if (/SFPN|SFP|PENDANT/.test(s)) return "Pendant";
  if (/SFNG|SFN|NECKLACE/.test(s)) return "Necklace";
  return "Ring";
}

function normalizeKaratMetal(text: string): string | null {
  if (/platinum/i.test(text)) return "Platinum";
  if (/\bsilver\b/i.test(text) && !/14k|18k|10k|22k/i.test(text)) return "Silver";
  const karat = (text.match(/\b(10|14|18|22)\s*K\b/i) || [])[1];
  const color = (text.match(/\b(Yellow|White|Rose|Pink)\b/i) || [])[1];
  if (!karat) return null;
  const colorWord = color ? color[0].toUpperCase() + color.slice(1).toLowerCase() : "";
  return `${karat}K${colorWord ? " " + colorWord : ""} Gold`.trim();
}

function toIso(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return d;
}

/** MTA Casting Hub invoice — fixed printed format. */
export function parseMtaInvoice(text: string): Dict {
  const out: Dict = { documentKind: "mta_casting", castVendor: "MTA Casting Hub" };

  const inv = text.match(/INVOICE\s*[:#]?\s*([A-Z0-9]{4,})/i);
  if (inv) out.castInvoice = inv[1].toUpperCase();

  const date =
    text.match(/DATE\s*[:#]?\s*(\d{4}-\d{2}-\d{2})/i) ||
    text.match(/DATE\s*[:#]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (date) out.castDate = toIso(date[1]);

  const due = text.match(/TOTAL\s*DUE\s*\$?\s*([\d,]+\.\d{2})/i);
  if (due) out.castTotal = String(num(due[1]));

  // "1.98/144.99" (DWT/price) then "3.07/93.54" (grams/price)
  const pairs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)];
  if (pairs[0]) out.castDWT = String(num(pairs[0][1]));
  if (pairs[1]) out.castGrams = String(num(pairs[1][1]));

  // print fee: integer between the grams pair and the row $total
  const printM = text.match(/\d+\.\d+\s*\/\s*\d+\.\d+\s+(\d{1,3})\s+\$?[\d,]+\.\d{2}/);
  if (printM) out.castPrint = String(num(printM[1]));

  const style = styleFrom(text);
  if (style) out.styleCode = style.replace(/-/g, "");
  const metal = normalizeKaratMetal(text);
  if (metal) out.metal = metal;
  out.productType = productTypeFromStyle(style);

  const rowTotal = text.match(/\$\s*([\d,]+\.\d{2})/);
  out.line_items = [
    {
      description: `MTA ${style ?? ""} ${metal ?? ""}`.replace(/\s+/g, " ").trim(),
      styleCode: style ? style.replace(/-/g, "") : null,
      metal,
      qty: 1,
      dwt: num(out.castDWT as string),
      grams: num(out.castGrams as string),
      printFee: out.castPrint != null ? num(out.castPrint as string) : null,
      lineTotal: rowTotal ? num(rowTotal[1]) : num(out.castTotal as string),
      amount: num(out.castTotal as string),
    },
  ];
  return out;
}

const SHAPE_MAP: Record<string, string> = {
  // Abbreviations
  MQ: "Marquise (MQ)", RND: "Round (RND)", RD: "Round (RND)", OV: "Oval", EM: "Emerald",
  PR: "Princess", CU: "Cushion", PE: "Pear", HRT: "Heart", AS: "Asscher", RAD: "Radiant", BG: "Baguette",
  // Full words as they appear on CAD spec headlines (OVAL SIZE:-…, RADIANT SIZE:-…)
  MARQUISE: "Marquise (MQ)", ROUND: "Round (RND)", OVAL: "Oval", EMERALD: "Emerald",
  PRINCESS: "Princess", CUSHION: "Cushion", PEAR: "Pear", HEART: "Heart", ASSCHER: "Asscher",
  RADIANT: "Radiant", BAGUETTE: "Baguette",
};
const shapeName = (code: string): string => SHAPE_MAP[code.toUpperCase()] || code;

// Shape tokens for the headline regex — longest/full words first so e.g. "OVAL"
// wins over "OV" and "ROUND" over "RND".
const SHAPE_TOKENS =
  "MARQUISE|PRINCESS|BAGUETTE|EMERALD|CUSHION|RADIANT|ASSCHER|ROUND|HEART|OVAL|PEAR|HRT|RND|RAD|MQ|EM|PR|CU|AS|BG|OV|PE|RD";

/** CAD / spec sheet — printed style table + headline (center/side) stones above it. */
export function parseCadSpec(text: string): Dict {
  const out: Dict = { documentKind: "cad_spec", metal: null };
  const style = styleFrom(text);
  if (style) out.styleCode = style;
  out.productType = productTypeFromStyle(style);

  // US ring sizes are ~3–16. OCR sometimes drops the decimal point ("5.5"→"55");
  // reject implausible values rather than emit a wrong size.
  const size = text.match(/\b(\d+(?:\.\d+)?)\s*-?\s*US\b/i);
  if (size) {
    const sv = Number(size[1]);
    if (Number.isFinite(sv) && sv >= 2 && sv <= 16) out.size = `${size[1]}-US`;
  }

  const stones: Dict[] = [];
  // Headline stones above the table: "OVAL SIZE:-12.51x8.83 MM", "MQ SIZE:-4.00x2.00 MM(4-PCS)".
  // The required ":"/"-" after SIZE distinguishes the headline ("SIZE:-…") from the
  // melee-table header ("…MM SIZE|"). "MM" is optional (some rows omit it). Dedupe
  // repeats (OCR sometimes doubles a line).
  const headRe = new RegExp(
    `\\b(${SHAPE_TOKENS})\\b[ \\t]{0,4}SIZE\\s*[:\\-]+\\s*(\\d+(?:\\.\\d+)?(?:\\s*[xX]\\s*\\d+(?:\\.\\d+)?)?)\\s*(?:MM)?\\s*(?:\\(?\\s*(\\d+)\\s*-?\\s*PCS\\)?)?`,
    "gi",
  );
  let h: RegExpExecArray | null;
  let firstHead = true;
  const seenHead = new Set<string>();
  while ((h = headRe.exec(text)) !== null) {
    const sizeMm = h[2].replace(/\s+/g, "");
    const key = `${h[1].toUpperCase()}|${sizeMm}`;
    if (seenHead.has(key)) continue;
    seenHead.add(key);
    stones.push({
      position: firstHead ? "Center" : "Side",
      shape: shapeName(h[1]),
      sizeMm,
      pcs: h[3] ? Number(h[3]) : 1,
      caratEach: null,
      caratTotal: null,
    });
    firstHead = false;
  }

  // Melee rows: shape | sieve | PTS | MM | QTY | WEIGHT. Take the LAST 4 numbers, but
  // ONLY accept a row when every field is sane — OCR mangles this tiny table (drops
  // decimals), and a wrong number is worse than none, so garbage rows are skipped.
  for (const line of text.split(/\r?\n/)) {
    if (!/\b(RND|RD)\b/i.test(line)) continue;
    if (/SIZE\s*[:\-]/i.test(line)) continue;
    const nums = line.match(/\d+(?:\.\d+)?/g) || [];
    if (nums.length < 4) continue;
    const [ptsS, mmS, qtyS, wtS] = nums.slice(-4);
    const pts = num(ptsS), mm = num(mmS), qty = Number(qtyS), wt = num(wtS);
    if (!ptsS.includes(".") || !wtS.includes(".")) continue; // real per-stone decimals expected
    if (!Number.isInteger(qty) || qty <= 0 || qty > 500) continue;
    if (mm == null || mm < 0.3 || mm > 20) continue;
    if (pts == null || pts <= 0 || pts >= 1) continue;
    if (wt == null || wt <= 0 || wt >= 5) continue;
    stones.push({ position: "Accent", shape: "Round (RND)", sizeMm: mmS, pcs: qty, caratEach: pts, caratTotal: wt });
  }

  if (stones.length) {
    out.stones = stones;
    out.stoneShape = stones[0].shape;
    out.stoneMM = stones[0].sizeMm;
  }
  const total = text.match(/TOTAL\s+(\d+)\s+([\d.]+)/i);
  if (total) {
    out.stonePcs = total[1];
    out.stoneCt = total[2];
  } else if (stones.length) {
    out.stonePcs = String(stones.reduce((a, s) => a + (Number(s.pcs) || 0), 0));
  }
  return out;
}
