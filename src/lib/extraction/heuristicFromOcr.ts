import type { ExtractedInvoice, ExtractedMemo } from "@/lib/schema/canonical";

/** Low-confidence guesses — always review before commit. */

export function heuristicInvoiceFromOcr(text: string): ExtractedInvoice {
  const t = text.replace(/\r/g, "\n");

  const invNo =
    pick(t, /invoice\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-/]*)/i) ??
    pick(t, /\binv\.?\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-/]*)/i) ??
    pick(t, /invoice\s*number\s*:?\s*([A-Z0-9]+)/i) ??
    pick(t, /invoice\s*no\.?\s*:?\s*([A-Z0-9]+)/i);

  const total =
    numPick(t, /(?:^|\n)\s*TOTAL\s*DUE\s*:?\s*\$?\s*([\d,]+\.?\d*)/im) ??
    numPick(t, /(?:^|\n)\s*TOTAL\s*:?\s*\$?\s*([\d,]+\.?\d*)/im) ??
    numPick(t, /(?:invoice\s*)?subtotal\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    numPick(t, /balance\s*due[^\d]*\$?\s*([\d,]+\.?\d*)/i);

  const invDate =
    isoFromSlash(pick(t, /invoice\s*date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)) ??
    isoFromSlash(pick(t, /date\s*:?\s*(\d{4}-\d{2}-\d{2})/i));

  let goldG =
    numPick(t, /\bwt\.?\s*\(\s*grams?\s*\)\s*[:#.]?\s*(\d+(?:\.\d+)?)/i) ??
    numPick(t, /(?:gold|metal|gr\.?\s*wt|g\.?\s*wt|weight|wt\.?)\s*[:#.]?\s*(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b/i) ??
    numPick(t, /\bGM\s*[:#.]?\s*(\d+(?:\.\d+)?)\b/i) ??
    numPick(t, /\b(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b(?!\s*(?:dwt|oz|pcs|ct)\b)/i) ??
    numPick(t, /wt\.?\s*\(grams?\)[^\d]*([\d.]+)/i) ??
    numPick(t, /\bGR\.?\s*[:#.]?\s*(\d+(?:\.\d+)?)\b/i);

  let dwt =
    numPick(t, /\bwt\.?\s*\(\s*dwt\s*\)\s*[:#.]?\s*(\d+(?:\.\d+)?)/i) ??
    numPick(t, /\b(\d+(?:\.\d+)?)\s*(?:DWT|d\.w\.t\.?|P\.?W\.?T\.?)\b/i) ??
    numPick(t, /\bDWT\s*[:#.]?\s*(\d+(?:\.\d+)?)\b/i) ??
    numPick(t, /\b(?:pennyweight|dwt\.?\s*wt)\s*[:#.]?\s*(\d+(?:\.\d+)?)\b/i);

  const metalLine =
    (
      pick(t, /\b(?:metal|material|karat|kt)\s*[:#.]?\s*([A-Za-z0-9\s]{3,50}?)(?:\n|$|,|\t)/i)?.replace(/\s+/g, " ").trim() ??
      pick(t, /\b(Platinum|Sterling|Silver|14K\s*WG|14K\s*YG|14K\s*RG|18K\s*WG|18K\s*YG|10K\s*WG|14KW|14KY|18KW|PT950|PT900|PT\b)\b[^\n]*/i)?.replace(/\s+/g, " ").trim() ??
      null
    ) || null;

  const styleGlob =
    pick(t, /\b(SFR-?\d{1,4}[A-Z]?|SFE-?\d{1,4}[A-Z]?|SFRBR-?\d{1,4}|SFPN-?\d{1,4}|SF[A-Z]{1,5}-?\d{1,4}[A-Z]?)\b/i) ??
    null;

  let printFee =
    numPick(t, /\bprint(?:ing)?(?:\s*fee)?[^\d\n$]{0,20}\$?\s*([\d,]+\.?\d*)/i) ??
    numPick(t, /\b(?:3D|CAD|model(?:ing)?|wax)\s*(?:fee|print|charge)?[^\d\n$]{0,12}\$?\s*([\d,]+\.?\d*)/i) ??
    numPick(t, /\b(?:sprue|tree)\s*(?:fee)?[^\d\n$]{0,10}\$?\s*([\d,]+\.?\d*)/i) ??
    numPick(t, /\bprint\b[^\d\n]{0,40}(\d{1,4}(?:\.\d{1,2})?)\b/i);

  const vendor =
    pick(t, /\bMTA\s+Cast(?:ing)?\s+Hub(?:\s+LLC)?\b[^\n]*/i)?.slice(0, 80) ??
    pick(t, /\bMTA\s+Casting[^\n]*/i)?.slice(0, 80) ??
    pick(t, /\bMC\s+Production[^\n]*/i)?.slice(0, 80) ??
    pick(t, /\bLABGROWNBOX[^\n]*/i)?.slice(0, 80) ??
    firstMeaningfulLine(t);

  const mergedLines = extractInvoiceLineItems(t);
  const dominantStyle = chooseDominantStyleCode(mergedLines) ?? styleGlob;
  const productRef = chooseProductRefForStyle(t, mergedLines, dominantStyle);
  if (goldG == null && mergedLines.length) {
    for (const li of mergedLines) {
      const d = li.description;
      const g = d.match(/\b(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b/i);
      if (g) {
        const n = Number(g[1]);
        if (Number.isFinite(n)) {
          goldG = n;
          break;
        }
      }
    }
  }
  if (dwt == null && mergedLines.length) {
    for (const li of mergedLines) {
      const d = li.description;
      const w = d.match(/\b(\d+(?:\.\d+)?)\s*(?:DWT|dwt)\b/i);
      if (w) {
        const n = Number(w[1]);
        if (Number.isFinite(n)) {
          dwt = n;
          break;
        }
      }
    }
  }

  if (printFee == null && mergedLines.length) {
    for (const li of mergedLines) {
      const d = li.description.toLowerCase();
      if (!/\b(print|printing|cad|3d|wax|model|sprue|tree)\b/.test(d)) continue;
      if (/\b(total|subtotal|tax|balance|due|invoice)\b/.test(d)) continue;
      if (li.amount != null && li.amount >= 0 && li.amount < 1e6) {
        printFee = li.amount;
        break;
      }
    }
  }

  let metalOut: string | null = metalLine;
  if (!metalOut && mergedLines.length) {
    for (const li of mergedLines) {
      const d = li.description;
      if (!/platinum|14k|18k|10k|silver|sterling|\bpt\b|plat\b|karat|\bkw\b|\bky\b|\bwg\b/i.test(d)) continue;
      const m = d.match(
        /\b(Platinum|Sterling|Silver|14K(?:\s+(?:White|Yellow|Rose)\s*Gold)?|18K(?:\s+(?:White|Yellow|Rose)\s*Gold)?|10K(?:\s+White)?\s*Gold?)\b/i,
      );
      if (m) {
        metalOut = m[1].replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  return {
    vendor,
    invoice_no: invNo,
    invoice_date: invDate,
    currency: /\bUSD\b|\$/i.test(t) ? "USD" : null,
    gold_weight_g: goldG,
    metal_weight_dwt: dwt,
    print_fee: printFee,
    metal: metalOut,
    style_code: dominantStyle,
    gold_rate_per_g: null,
    metal_cost: null,
    labor_cost: numPick(t, /labor\s*:?\s*\$?\s*([\d,]+\.?\d*)/i),
    other_charges: null,
    total,
    line_items: mergedLines.length ? mergedLines : undefined,
    product_ref: productRef,
    confidence: {
      vendor: vendor ? 0.35 : 0.1,
      invoice_no: invNo ? 0.45 : 0.1,
      total: total != null ? 0.4 : 0.1,
    },
  };
}

function chooseDominantStyleCode(lines: Array<{ description: string; amount: number | null }>): string | null {
  if (!lines.length) return null;
  const scores = new Map<string, number>();
  for (const li of lines) {
    const d = li.description;
    const found = d.match(/\b([A-Z]{2,6}-?\d{1,4}[A-Z]?)\b/gi) ?? [];
    for (const raw of found) {
      const code = raw.toUpperCase();
      if (/(?:^|[\s-])(INV|MM|PCS|CT|DWT|ST)(?:$|[\s-])/.test(code)) continue;
      let score = 2;
      if (/\b(print|printing|cad|3d|wax|model|sprue|tree)\b/i.test(d)) score += 2;
      if (/\b(\d+(?:\.\d+)?)\s*(?:DWT|dwt|g|gm|grams?)\b/i.test(d)) score += 3;
      if (li.amount != null && Number.isFinite(li.amount)) score += Math.min(li.amount / 1000, 2);
      scores.set(code, (scores.get(code) ?? 0) + score);
    }
  }
  let best: string | null = null;
  let bestScore = -1;
  for (const [code, score] of scores.entries()) {
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

function chooseProductRefForStyle(
  text: string,
  lines: Array<{ description: string; amount: number | null }>,
  styleCode: string | null,
): string | null {
  if (styleCode) {
    const line = lines.find((li) => new RegExp(`\\b${escapeRegex(styleCode)}\\b`, "i").test(li.description));
    if (line) return line.description.slice(0, 120);
    return styleCode;
  }
  return (
    pick(text, /(SFR-\d+|BR-\d+|MQ\s+[^\n]+|PEAR\s+[^\n]+|EM\s+[^\n]+)/i) ??
    pick(text, /description[^\n]*\n\s*([A-Z0-9][^\n]{4,60})/i)
  );
}

export type ParsedLineItem = {
  description: string;
  amount: number | null;
  styleCode?: string | null;
  metal?: string | null;
  karat?: string | null;
  qty?: number | null;
  dwt?: number | null;
  grams?: number | null;
  printFee?: number | null;
  lineTotal?: number | null;
};

/**
 * True for the header/labels row in an MTA-style table — "Metal", "MarketPrice",
 * "Gold: 3558.70" totals row, etc. These MUST NOT become invoice lines.
 */
function looksLikeHeaderOrTotalsLine(line: string): boolean {
  return /\b(description|wt\.?\s*\(|dwt\s*\/|print\s*fee|market\s*price|metal\s*discount|platinum\s*discount|gold\s*discount|applied\s*credit|sub\s*total|subtotal|total\s*due|balance\s*due|grand\s*total|please\s*note|thank\s*you|sales\s*tax|invoice\s*date)\b/i.test(
    line,
  );
}

/**
 * Pattern match for MTA Casting Hub rows. The columns are:
 *   [Gold|Platinum] [STYLE CODE] [detail…] [QTY] [DWT/DWT_PRICE] [GRAMS/GRAMS_PRICE] [PRINT_FEE] [$TOTAL]
 * Example: "Gold BR-09 Yellow 14K 4 15.86/160.15 24.58/103.32 70 $2,609.61"
 *
 * We first find the two `num/num` slash-price patterns in the row (that's the DWT/grams
 * block), then pull qty (last int before them) and printFee (int after them, before $total).
 */
function parseMtaCastingRow(line: string): ParsedLineItem | null {
  if (!/^(Gold|Platinum)\b/i.test(line)) return null;
  if (looksLikeHeaderOrTotalsLine(line)) return null;

  const slashPairs = [...line.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)];
  if (slashPairs.length < 2) return null;

  const style = line.match(/\b([A-Z]{2,6}-?\d{1,4}[A-Z]?)\b/)?.[1] ?? null;

  const dwt = Number(slashPairs[0]?.[1]);
  const grams = Number(slashPairs[1]?.[1]);

  const secondSlashEnd = (slashPairs[1]?.index ?? 0) + (slashPairs[1]?.[0]?.length ?? 0);
  const tail = line.slice(secondSlashEnd);
  // Total: last number on the row, may include $ and thousands separator.
  const totalMatch = tail.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)\s*$/);
  const lineTotal = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null;
  // Print fee: integer or decimal sitting between the second slash-pair and the $ total.
  const printBetween = tail.replace(/\$?\s*[\d,]+(?:\.\d{1,2})?\s*$/, "");
  const printMatch = printBetween.match(/(\d+(?:\.\d+)?)/);
  const printFee = printMatch ? Number(printMatch[1]) : null;

  // Qty: the integer immediately before the first slash-pair (usually single digit).
  const beforeFirstPair = line.slice(0, slashPairs[0]?.index ?? 0);
  const qtyMatch = beforeFirstPair.match(/(?:^|\s)(\d{1,3})(?=\s*$|\s+\S*\d+\s*\/)/) ?? beforeFirstPair.match(/(\d{1,3})\s*$/);
  const qty = qtyMatch ? Number(qtyMatch[1]) : null;

  const karatMatch = line.match(/\b(10K|14K|18K|22K|24K|Platinum|Standard)\b/i)?.[1] ?? null;
  const colorMatch = line.match(/\b(Yellow|White|Rose|Pink|Green)\b/i)?.[1] ?? null;
  const karatComposed = karatMatch
    ? colorMatch && /K$/i.test(karatMatch)
      ? `${karatMatch} ${colorMatch}`
      : karatMatch
    : null;

  const metal = /^Platinum/i.test(line) ? "Platinum" : /^Gold/i.test(line) ? "Gold" : null;

  return {
    description: cleanLineDescription(line).slice(0, 160),
    amount: Number.isFinite(lineTotal ?? NaN) ? lineTotal : null,
    styleCode: style,
    metal,
    karat: karatComposed,
    qty: Number.isFinite(qty ?? NaN) ? qty : null,
    dwt: Number.isFinite(dwt) ? dwt : null,
    grams: Number.isFinite(grams) ? grams : null,
    printFee: Number.isFinite(printFee ?? NaN) ? printFee : null,
    lineTotal: Number.isFinite(lineTotal ?? NaN) ? lineTotal : null,
  };
}

function extractInvoiceLineItems(text: string): ParsedLineItem[] {
  const out: ParsedLineItem[] = [];
  const lines = text
    .split("\n")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (looksLikeHeaderOrTotalsLine(line)) continue;

    // First: try the strict MTA-casting row parser (gives us per-row weights + fees).
    const mta = parseMtaCastingRow(line);
    if (mta && mta.styleCode) {
      out.push(mta);
      continue;
    }

    // Generic fallback: any row with a style code in it.
    const style = line.match(/\b([A-Z]{2,5}-?\d{1,4}[A-Z]?)\b/);
    if (!style) continue;
    if (/invoice|subtotal|total due|discount|credit|market price|description/i.test(line)) continue;

    // Grab a trailing amount from the row (e.g. ... 20.69)
    const nums = [...line.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+\.\d{1,2})/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    const amount = nums.length ? nums[nums.length - 1] : null;

    out.push({
      description: cleanLineDescription(line).slice(0, 140),
      amount: Number.isFinite(amount ?? NaN) ? amount : null,
      styleCode: style[1] ?? null,
    });
  }

  // De-dup repeated OCR rows
  const seen = new Set<string>();
  const deduped = out.filter((x) => {
    const key = `${x.description}|${x.amount ?? "null"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fallback: if OCR merged/broke table rows, still recover style codes globally.
  const styleMatches = [...text.matchAll(/\b([A-Z]{2,5}-?\d{1,4}[A-Z]?)\b/g)].map((m) => m[1]);
  for (const styleCode of [...new Set(styleMatches)]) {
    if (/(?:^|[\s-])(INV|MM|PCS|CT|DWT|ST)(?:$|[\s-])/i.test(styleCode)) continue;
    const exists = deduped.some((x) => new RegExp(`\\b${escapeRegex(styleCode)}\\b`, "i").test(x.description));
    if (exists) continue;

    const hostLine = lines.find((ln) => new RegExp(`\\b${escapeRegex(styleCode)}\\b`, "i").test(ln)) ?? styleCode;
    if (looksLikeHeaderOrTotalsLine(hostLine)) continue;
    const nums = [...hostLine.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+\.\d{1,2})/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    const amount = nums.length ? nums[nums.length - 1] : null;
    deduped.push({
      description: cleanLineDescription(hostLine),
      amount: Number.isFinite(amount ?? NaN) ? amount : null,
      styleCode,
    });
  }

  // Rows like "PRINT FEE" / "CAD" with an amount but no style code on the line
  for (const line of lines) {
    if (/invoice|subtotal|total due|balance due|grand total/i.test(line)) continue;
    if (!/\b(print|printing|cad|3d\s*print|wax|model|sprue|flask)\b/i.test(line)) continue;
    const nums = [...line.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+\.\d{1,2})/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    const amount = nums.length ? nums[nums.length - 1] : null;
    if (!Number.isFinite(amount ?? NaN)) continue;
    const desc = cleanLineDescription(line).slice(0, 140);
    const key = `${desc}|${amount}`;
    if (deduped.some((x) => `${x.description}|${x.amount ?? "null"}` === key)) continue;
    deduped.push({ description: desc, amount });
  }

  return deduped;
}

function cleanLineDescription(line: string): string {
  const words = line.replace(/^[=:+\-\s]+/, "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && prev.toLowerCase() === w.toLowerCase()) continue;
    out.push(w);
  }
  return out.join(" ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function heuristicMemoFromOcr(text: string): ExtractedMemo {
  const t = text.replace(/\r/g, "\n");

  const supplier =
    pick(t, /Labgrown\s*Box[^\n]*/i)?.slice(0, 120) ??
    pick(t, /LabgrownBox[^\n]*/i)?.slice(0, 120);

  const memoDate =
    isoFromSlash(pick(t, /DATE\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)) ??
    isoFromSlash(pick(t, /(\d{1,2}\/\d{1,2}\/\d{2,4})/));

  const toParty = pick(t, /TO\s*:?\s*([A-Za-z0-9\s]+)/i);

  const grand =
    numPick(t, /(?:^|\n)\s*([\d,]+\.?\d*)\s*\$\s*$/m) ??
    numPick(t, /(?:grand|memo)\s*total[^\d]*\$?\s*([\d,]+\.?\d*)/i) ??
    numPick(t, /total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const caratSum = sumCarats(t);

  const stones = extractMemoDescriptions(t);

  return {
    memo_id: null,
    supplier: supplier ?? toParty,
    stones_summary: stones || t.slice(0, 500).replace(/\s+/g, " ").trim() || null,
    carat_total: caratSum,
    cost: grand,
    return_date: memoDate,
    notes: toParty ? `TO: ${toParty.trim()}` : null,
    confidence: { stones_summary: stones ? 0.25 : 0.12 },
  };
}

function pick(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m?.[1]?.trim() || null;
}

function numPick(s: string, re: RegExp): number | null {
  const raw = pick(s, re);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMeaningfulLine(s: string): string | null {
  for (const line of s.split("\n")) {
    const L = line.trim();
    if (L.length > 3 && L.length < 100 && !/^MEMORANDUM/i.test(L)) return L;
  }
  return null;
}

function isoFromSlash(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return s.includes("-") ? s : null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  try {
    return new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function sumCarats(s: string): number | null {
  const matches = [...s.matchAll(/\b(\d+\.\d{1,3})\s*(?:ct|carat|cts)\b/gi)];
  if (!matches.length) return null;
  const sum = matches.reduce((a, m) => a + Number(m[1]), 0);
  return Number.isFinite(sum) && sum > 0 ? Math.round(sum * 1000) / 1000 : null;
}

function extractMemoDescriptions(s: string): string | null {
  const chunks: string[] = [];
  for (const m of s.matchAll(/\b(SFR-\d+|BR-\d+|LG\d+|SER-\d+)\b[^\n]*/gi)) {
    chunks.push(m[0].trim());
  }
  return chunks.length ? [...new Set(chunks)].join(" | ").slice(0, 400) : null;
}
