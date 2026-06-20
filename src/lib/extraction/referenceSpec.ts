/**
 * Extraction reference "playbook" — injected into the AI prompt so Gemini/Groq
 * have field definitions, hard rules, and worked examples (few-shot) to copy.
 * This is the file to UPDATE as new vendor formats appear — no model training.
 *
 * Each example is a REAL LabGrownBox order transcribed to the exact target JSON.
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

const CAD_SPEC_REFERENCE = `
REFERENCE — CAD SPEC SHEET (one piece per sheet; this is NOT an invoice):
Fields to capture: styleCode (STYLE NO, e.g. SFR-123), size (SIZE, e.g. "5.5 US"),
metalWeights {k10,k14,k18,k22,silver,platinum} from the NW-/NT- lines, and a stones[] array.
Stone table columns: SHAPE | SIEVE SIZE | PTS | MM SIZE | QTY | WEIGHT → one stones[] row each.
CRITICAL RULE: the CENTER and FEATURE stones are often written ABOVE the table, e.g.
"MQ SIZE:-13.00x6.50 MM" (one centre marquise) and "MQ SIZE:-4.00x2.00 MM(4-PCS)" (four side).
Always add these as stones[] entries. Shape prefixes: RND/RD=Round, MQ=Marquise, OV=Oval,
PS/PR=Pear, EM=Emerald, PRN=Princess, CU=Cushion, BG=Baguette. Read "(N-PCS)" as pcs=N.
Never treat the karat net-weight rows or ring dimensions (15.25 MM etc.) as stones.

EXAMPLE (style SFR-120, marquise halo):
Above the table: "MQ SIZE:-13.00x6.50 MM", "MQ SIZE:-4.00x2.00 MM(4-PCS)". STYLE NO SFR-120, SIZE 4.5-US.
NT-10K 2.660, NT-14K 3.000, NT-18K 3.590, NT-22K 4.160, SILVER 2.410, PLATINUM 4.810.
Table: RND +000-00 0.0045 0.9mm x12; RND +00-0 0.005 1mm x6; RND +0-1.0 0.006 1.1mm x1; RND +3.5-4.0 0.012 1.4mm x6. TOTAL 25 / 0.162.
→ {
  "documentKind":"cad_spec","styleCode":"SFR-120","productType":"Ring","size":"4.5-US","metal":null,
  "metalWeights":{"k10":2.66,"k14":3.0,"k18":3.59,"k22":4.16,"silver":2.41,"platinum":4.81},
  "stones":[
    {"position":"Center","shape":"Marquise (MQ)","sizeMm":"13.00x6.50","pcs":1,"caratEach":null,"caratTotal":null},
    {"position":"Side","shape":"Marquise (MQ)","sizeMm":"4.00x2.00","pcs":4,"caratEach":null,"caratTotal":null},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"0.9","pcs":12,"caratEach":0.0045,"caratTotal":0.054},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1","pcs":6,"caratEach":0.005,"caratTotal":0.030},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1.1","pcs":1,"caratEach":0.006,"caratTotal":0.006},
    {"position":"Accent","shape":"Round (RND)","sizeMm":"1.4","pcs":6,"caratEach":0.012,"caratTotal":0.072}
  ],
  "stoneShape":"Marquise (MQ)","stoneMM":"13.00x6.50","stonePcs":31,"stoneCt":0.162,"line_items":null }
`;

const MTA_REFERENCE = `
REFERENCE — MTA CASTING HUB INVOICE (fixed format every time):
Header: vendor "MTA Casting Hub", invoice no (top-right, e.g. BDE7N), date. Metal + MarketPrice line.
Table: Metal | Description | Quantity | Wt.(DWT)/Price | Wt.(Grams)/Price | Print Fee | Total.
The description holds the style + karat, e.g. "SFR123 Yellow 14K".
HARD RULE: castTotal = the "TOTAL DUE" figure (AFTER "Gold/Platinum Metal Discount"), NOT "SUB TOTAL".
Numbers only (no $ , ). printFee is an integer (e.g. 20, not 2). dwt/grams come from the left value of each "value/price" pair.

EXAMPLE (style SFR123):
Invoice BDE7N, date 2026-06-16, Metal Gold (MarketPrice 4325).
Row: Gold | SFR123 Yellow 14K | Qty 1 | 1.98/144.99 | 3.07/93.54 | Print 20 | $307.17.
SUB TOTAL 307.17, Gold Metal Discount 5.74, TOTAL DUE 301.43.
→ {
  "documentKind":"mta_casting","castVendor":"MTA Casting Hub","castInvoice":"BDE7N","castDate":"2026-06-16",
  "metal":"14K Yellow Gold","styleCode":"SFR-123","productType":"Ring",
  "castDWT":1.98,"castGrams":3.07,"castPrint":20,"castTotal":301.43,
  "line_items":[{"description":"SFR123 Yellow 14K","styleCode":"SFR-123","metal":"Gold","karat":"14K Yellow","qty":1,"dwt":1.98,"grams":3.07,"printFee":20,"lineTotal":307.17,"amount":307.17}] }
`;

const MEMO_REFERENCE = `
REFERENCE — STONE APPROVAL MEMO (handwritten, unpredictable layout):
We ONLY need the diamond size → weight list. Each row reads "RD <mm>mm <pcs> <carat-weight>".
Build stones[] with {shape, sizeMm, pcs, caratTotal}. Shape "RD"/"RND" = Round (RND).
Sum caratTotal into stoneCt and pcs into stonePcs. If a setter/labour/setting price is written
(e.g. "$350"), put it in setTotal; otherwise null. Ignore names, dates, memo numbers, signatures.

EXAMPLE (memo for SFR-123):
SFR-123 — RD 3mm 1 0.098 | RD 2mm 1 0.01 | RD 1.8mm 1 0.01 | RD 2.6mm 1 0.04 | RD 2.4mm 1 0.03 | RD 2.2mm 1 0.02.
→ {
  "documentKind":"memo","styleCode":"SFR-123","stoneShape":"Round (RND)",
  "stones":[
    {"shape":"Round (RND)","sizeMm":"3","pcs":1,"caratTotal":0.098},
    {"shape":"Round (RND)","sizeMm":"2","pcs":1,"caratTotal":0.01},
    {"shape":"Round (RND)","sizeMm":"1.8","pcs":1,"caratTotal":0.01},
    {"shape":"Round (RND)","sizeMm":"2.6","pcs":1,"caratTotal":0.04},
    {"shape":"Round (RND)","sizeMm":"2.4","pcs":1,"caratTotal":0.03},
    {"shape":"Round (RND)","sizeMm":"2.2","pcs":1,"caratTotal":0.02}
  ],
  "stonePcs":6,"stoneCt":0.208,"setTotal":null,"line_items":null }
`;

/** Returns the reference block (rules + worked example) for a document kind, or "". */
export function referenceForKind(kind: DocumentKind): string {
  switch (kind) {
    case "cad_spec":
      return CAD_SPEC_REFERENCE.trim();
    case "mta_casting":
      return MTA_REFERENCE.trim();
    case "memo":
      return MEMO_REFERENCE.trim();
    default:
      return "";
  }
}
