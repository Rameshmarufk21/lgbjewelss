/**
 * Reference specs (few-shot examples + strict field rules) injected into the AI
 * prompt per document type. This is the "reference file" the team edits to make
 * Gemini/Groq parse definite, repeatable requirements — no model training needed.
 *
 * Keyed by the document kind the classifier assigns. Edit the rules/examples here
 * and extraction behavior changes immediately.
 */

const CAD_SPEC = String.raw`
=== REFERENCE: CAD / SPEC SHEET (one ring/piece) ===
Layout: ring renders with mm dimension callouts around them (e.g. "14.35 MM", "2.00 MM" — these are band/profile dimensions, IGNORE for data), a small spec table, and a melee stone table.

The spec table contains, in this order:
  • One or more HEADLINE STONE lines ABOVE everything else, e.g.
        "MQ SIZE:- 13.00x6.50 MM"            -> the CENTER stone
        "MQ SIZE:- 4.00x2.00 MM(4-PCS)"      -> 4 matching side/accent stones
     Capture EVERY such line. shape codes: MQ=Marquise, OV=Oval, RND/RD=Round, EM=Emerald,
     PR=Princess, CU=Cushion, PE=Pear, HRT=Heart, AS=Asscher, RAD=Radiant, BG=Baguette.
     sizeMm = the "AxB" (or single) value in mm. pcs = the "(n-PCS)" number (center = 1 if none).
     The physically largest headline stone is the center stone.
  • A karat NET-WEIGHT ladder: "NT-10K / NT-14K / NT-18K / NT-22K" (or "NW-..."), "SILVER", "PLATINUM".
     These are NET METAL WEIGHTS in grams for that metal — NOT prices, NOT stones, NOT style codes.
  • "SIZE" = the ring/finger size (e.g. "4.5-US", "5.5 US").
  • "STYLE NO" = the style code (e.g. SFR-120, SFR-123). This is the ONLY style code.
  • A melee table: columns SHAPE | SIEVE SIZE | PTS | MM SIZE | QTY | WEIGHT, then a TOTAL row.
     Capture every data row: shape, sizeMm (MM SIZE col), pts (PTS col), pcs (QTY col), caratTotal (WEIGHT col).

Combine headline stones + melee rows into ONE stones[] array. stonePcs = grand total QTY (incl. headline pcs);
stoneCt = grand total carat (TOTAL WEIGHT, melee total; add headline carats only if printed).

WORKED EXAMPLE (style SFR-120):
{ "documentKind":"cad_spec", "styleCode":"SFR-120", "productType":"Ring", "metal":null, "size":"4.5-US",
  "stoneShape":"Marquise (MQ)", "stoneMM":"13.00x6.50", "stonePcs":25, "stoneCt":0.162,
  "stones":[
    {"position":"Center","shape":"Marquise (MQ)","sizeMm":"13.00x6.50","pcs":1,"caratEach":null,"caratTotal":null},
    {"position":"Side","shape":"Marquise (MQ)","sizeMm":"4.00x2.00","pcs":4,"caratEach":null,"caratTotal":null},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"0.9","pcs":12,"caratEach":0.0045,"caratTotal":0.054},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1","pcs":6,"caratEach":0.005,"caratTotal":0.030},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1.1","pcs":1,"caratEach":0.006,"caratTotal":0.006},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1.4","pcs":6,"caratEach":0.012,"caratTotal":0.072}
  ],
  "line_items":null }
`;

const MTA_CASTING = String.raw`
=== REFERENCE: MTA CASTING HUB INVOICE (fixed format every time) ===
Header: "MTA Casting Hub LLC", "INVOICE: <code>", "DATE: YYYY-MM-DD", bill-to "Lab Grown Box Inc.".
A row "Metal | MarketPrice" (e.g. Gold 4325) — this is the metal spot price, NOT a product.
Line table columns: Metal | DESCRIPTION | QUANTITY | Wt(DWT)/Price | Wt(Grams)/Price | Print Fee | TOTAL.
Totals block: "SUB TOTAL", "APPLIED CREDIT", "<Metal> Metal Discount", "TOTAL DUE".

RULES (do exactly this):
  • castVendor = "MTA Casting Hub". castInvoice = the INVOICE code. castDate = DATE (YYYY-MM-DD).
  • For each product row: styleCode (e.g. "SFR123"), metal+karat normalized (e.g. "Yellow 14K" -> "14K Yellow Gold"),
    qty, dwt = number BEFORE the slash in Wt(DWT)/Price, grams = number BEFORE the slash in Wt(Grams)/Price,
    printFee = the Print Fee integer, lineTotal = the row TOTAL.
  • castTotal = the "TOTAL DUE" value (AFTER subtracting the metal discount) — NOT "SUB TOTAL".
  • NEVER treat "MarketPrice", the "<Metal> Metal Discount" row, or "Gold:/Platinum:" subtotal as a product.
  • Set castDWT / castGrams / castPrint to the first product row's values.

WORKED EXAMPLE (invoice BDE7N):
{ "documentKind":"mta_casting", "castVendor":"MTA Casting Hub", "castInvoice":"BDE7N", "castDate":"2026-06-16",
  "metal":"14K Yellow Gold", "styleCode":"SFR123", "productType":"Ring",
  "castDWT":1.98, "castGrams":3.07, "castPrint":20, "castTotal":301.43,
  "line_items":[
    {"description":"Gold SFR123 Yellow 14K","styleCode":"SFR123","metal":"Gold","karat":"14K Yellow",
     "qty":1,"dwt":1.98,"grams":3.07,"printFee":20,"lineTotal":307.17,"amount":307.17}
  ] }
(Note: lineTotal is the pre-discount row total 307.17; castTotal is the TOTAL DUE 301.43.)
`;

const STONE_MEMO = String.raw`
=== REFERENCE: LABGROWNBOX STONE APPROVAL MEMO (handwritten — layout varies) ===
We ONLY need: the style code (written at the top of the rows, e.g. "SFR-123"), and each stone line.
Stone lines look like: "RD 3mm | 1 | 0.098"  =>  shape | mm size | pcs | carat weight.
Columns on the form: Descriptions | PCS | WEIGHT/CRT | PRICE/CT | RETURN | TOTAL.
shape codes: RD/RND=Round, MQ=Marquise, OV=Oval, PR=Princess, EM=Emerald, PE=Pear, CU=Cushion, BG=Baguette.

RULES:
  • Capture every readable stone row as {shape, sizeMm (the mm number), pcs, caratTotal (the WEIGHT/CRT value)}.
  • If a number is unreadable, use null — NEVER guess.
  • If a setter/labor cost or a $ amount is written, put it in setterCost; otherwise null.
  • IGNORE signatures, the memo number, price-per-ct scribbles, and "RETURN/TOTAL" columns.
  • totalPcs = sum of pcs; totalCarat = sum of caratTotal.

WORKED EXAMPLE (memo for SFR-123):
{ "documentKind":"memo", "styleCode":"SFR-123", "setterCost":null,
  "totalPcs":6, "totalCarat":0.208,
  "stones":[
    {"shape":"Round (RND)","sizeMm":"3","pcs":1,"caratTotal":0.098},
    {"shape":"Round (RND)","sizeMm":"2.6","pcs":1,"caratTotal":0.03},
    {"shape":"Round (RND)","sizeMm":"2.4","pcs":1,"caratTotal":0.03},
    {"shape":"Round (RND)","sizeMm":"2.2","pcs":1,"caratTotal":0.02},
    {"shape":"Round (RND)","sizeMm":"2","pcs":1,"caratTotal":0.01},
    {"shape":"Round (RND)","sizeMm":"1.8","pcs":1,"caratTotal":0.02}
  ] }
`;

const SPECS: Record<string, string> = {
  cad_spec: CAD_SPEC,
  mta_casting: MTA_CASTING,
  memo: STONE_MEMO,
};

/** Returns the reference block for a document kind, or "" when none applies. */
export function referenceSpecFor(kind: string): string {
  return SPECS[kind] ?? "";
}
