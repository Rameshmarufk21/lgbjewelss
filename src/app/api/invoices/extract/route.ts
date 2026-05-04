import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getApiKey } from "@/lib/apiKeys";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    // Pre-process image
    const buf = Buffer.from(await file.arrayBuffer());
    const processed = await sharp(buf)
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    // Upload to Vercel Blob for permanent storage
    const blob = await put(
      `invoices/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}.jpg`,
      processed,
      { access: "public" },
    );

    const b64 = processed.toString("base64");
    let extracted: Record<string, unknown> | null = null;
    let usedLayer = 0;
    let lastError = "";

    // LAYER 1: Gemini 1.5 Pro
    try {
      const key = await getApiKey("gemini");
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: "image/jpeg", data: b64 } },
                  { text: EXTRACTION_PROMPT },
                ],
              },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message ?? "Gemini Pro failed");
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
      usedLayer = 1;
    } catch (e) {
      lastError = String(e);
      console.warn("[extract] Layer 1 (Gemini Pro) failed:", lastError);
    }

    // LAYER 2: Gemini 1.5 Flash
    if (!extracted) {
      try {
        const key = await getApiKey("gemini");
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inline_data: { mime_type: "image/jpeg", data: b64 } },
                    { text: EXTRACTION_PROMPT },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 4096 },
            }),
          },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message ?? "Gemini Flash failed");
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
        usedLayer = 2;
      } catch (e) {
        lastError = String(e);
        console.warn("[extract] Layer 2 (Gemini Flash) failed:", lastError);
      }
    }

    // LAYER 3: Groq LLaMA Vision
    if (!extracted) {
      try {
        const key = await getApiKey("groq");
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "llama-3.2-11b-vision-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
                  { type: "text", text: EXTRACTION_PROMPT },
                ],
              },
            ],
            max_tokens: 4096,
            temperature: 0,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message ?? "Groq failed");
        const text = d.choices?.[0]?.message?.content ?? "";
        extracted = JSON.parse(text.replace(/```json|```/g, "").trim());
        usedLayer = 3;
      } catch (e) {
        lastError = String(e);
        console.warn("[extract] Layer 3 (Groq) failed:", lastError);
      }
    }

    if (!extracted) {
      return NextResponse.json(
        {
          error: "All extraction layers failed",
          detail: lastError,
        },
        { status: 500 },
      );
    }

    // Validate: check if line item sum matches stated total
    const lineSum = ((extracted.lineItems as Array<{ lineTotal?: number }>) ?? [])
      .reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    const stated = (extracted.totalDue as number) ?? 0;
    if (stated > 0 && Math.abs(lineSum - stated) > 0.03) {
      extracted.flagForReview = true;
      extracted.flagReason = `Line sum $${lineSum.toFixed(2)} does not match stated total $${stated.toFixed(2)}`;
    }

    return NextResponse.json({
      extracted,
      imageUrl: blob.url,
      usedLayer,
      flagged: !!extracted.flagForReview,
    });
  } catch (e) {
    console.error("Extract route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

const EXTRACTION_PROMPT = `
You are an expert invoice reader for Labgrown Box Inc, a fine jewelry
manufacturing company at 55W 47th Street Suite 890, New York NY 10036.
DOCUMENT TYPES YOU WILL SEE:
TYPE A — MTA CASTING HUB (printed invoice):
Columns: Metal | Description | Quantity | Wt(DWT)/Price | Wt(Grams)/Price | Print Fee | Total
Has invoice ID, date, gold/platinum market prices at top.
Footer: Subtotal | Gold Metal Discount | Platinum Metal Discount | Total Due.
Style codes: SFR-xx, BR-xx, SFHEAD, SFBR, SFNP — extract exactly as written.
TYPE B — CARAT CAST LLC (printed invoice):
Header: Invoice No (CC-xxxx), Date, Terms (COD), Attention (team member name),
  Gold Price, Plat Price, Silver Price shown at top.
Columns: LINE | PIECES | DESCRIPTION | STYLE NO | KT/METAL | WEIGHT(G) |
  LABOUR/G | RATE | WAX | LINE TOTAL.
CRITICAL: Lines with description "RETURN" have negative LINE TOTAL.
  Set isReturn=true for these lines.
Footer: TOTAL | CHARGES | SHIPPING | INVOICE TOTAL.
TYPE C — MC PRODUCTION US LLC (printed invoice):
Header: Invoice # (5-digit number), Invoice date, Job: Setting & Repair.
Columns: Item | Description | Qty | ST# | Setting Price | Labor | Laser |
  Unit Price | Price.
Footer: Invoice Subtotal | Tax Rate | Sales Tax | Deposit Received | TOTAL.
TYPE D — OTHER SETTER (handwritten, Phil's Stationery memorandum form):
Header: TO: [setter name], DATE, NO (memo number).
Columns: LOT NO | PIECES | DESCRIPTION | CARATS | PRICE PER CARAT | TOTAL.
Note: descriptions contain style codes and stone descriptions.
TYPE E — FINDINGS VENDOR (Gallo Mounting, Moon, Orange Findings,
  Crown Findings, Ross Metals, or similar):
Format varies by vendor. Extract all line items and totals present.
EXTRACTION RULES:
1. Identify the document type first.
2. Extract EVERY line item. Do not skip any row.
3. For CARAT RETURN lines: set isReturn=true, lineTotal will be negative.
4. For handwritten text: read carefully. If a value is genuinely
   unreadable, write "UNCLEAR". NEVER guess or estimate dollar amounts.
5. After extracting all lines, check: does the sum of all lineTotals
   equal the totalDue? If the difference is more than $0.03,
   set flagForReview=true and explain in flagReason.
6. Return ONLY valid JSON. No markdown fences. No explanation text.
   The response must start with { and end with }.
REQUIRED JSON STRUCTURE:
{
  "documentType": "mta_casting|carat_casting|mc_setting|other_setting|findings",
  "vendorName": "",
  "invoiceNumber": "",
  "invoiceDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "terms": "",
  "attentionTo": "",
  "goldMarketPrice": null,
  "platMarketPrice": null,
  "confidence": "high|medium|low",
  "flagForReview": false,
  "flagReason": "",
  "lineItems": [
    {
      "styleCode": "",
      "description": "",
      "metalType": "",
      "karat": "",
      "quantity": null,
      "weightGrams": null,
      "labourPerGram": null,
      "rate": null,
      "waxFee": null,
      "weightDwt": null,
      "dwtPrice": null,
      "printFee": null,
      "settingPrice": null,
      "laborCost": null,
      "laserCost": null,
      "stoneCount": null,
      "unitPrice": null,
      "lineTotal": null,
      "isReturn": false
    }
  ],
  "metalDeliveredByKarat": {
    "14KYellow": null,
    "14KWhite": null,
    "10KYellow": null,
    "platinum": null
  },
  "subtotal": null,
  "goldDiscount": null,
  "platinumDiscount": null,
  "charges": null,
  "shipping": null,
  "salesTax": null,
  "depositReceived": null,
  "totalDue": null
}
`;
