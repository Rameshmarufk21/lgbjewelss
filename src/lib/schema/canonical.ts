import { z } from "zod";
import type { PaymentStatus, ProductStatus } from "@/lib/types/status";

/**
 * Stable `product_id` = Prisma `Product.id` (cuid). Never derive from row order in Excel.
 * Excel import/export must preserve the product_id column for round-trip safety.
 */

export const PRODUCT_STATUS_VALUES: ProductStatus[] = [
  "cad_sent",
  "casting",
  "stones",
  "setter",
  "qc",
  "sold",
  "archived",
];

export const PAYMENT_STATUS_VALUES: PaymentStatus[] = [
  "unpaid",
  "partial",
  "paid",
];

/** Row shape for the primary "Products" sheet (flattened aggregates + identity). */
export const productExportRowSchema = z.object({
  product_id: z.string().min(1),
  display_name: z.string().nullable().optional(),
  cad_filename_stem: z.string().nullable().optional(),
  status: z.enum([
    "cad_sent",
    "casting",
    "stones",
    "setter",
    "qc",
    "sold",
    "archived",
  ]),
  maker_name: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  client_email: z.string().nullable().optional(),
  client_notes: z.string().nullable().optional(),
  sell_price: z.number().nullable().optional(),
  currency: z.string().default("USD"),
  notes: z.string().nullable().optional(),
  total_casting_cents: z.number().int().nonnegative(),
  total_stones_cents: z.number().int().nonnegative(),
  total_findings_cents: z.number().int().nonnegative(),
  grand_cost_cents: z.number().int().nonnegative(),
  profit_cents: z.number().int().nullable().optional(),
  invoice_payment_status: z.enum(["unpaid", "partial", "paid"]),
  created_at_iso: z.string(),
  updated_at_iso: z.string(),
});

export type ProductExportRow = z.infer<typeof productExportRowSchema>;

/** One row per vendor invoice (detail sheet). */
export const invoiceExportRowSchema = z.object({
  product_id: z.string().min(1),
  invoice_row_id: z.string().min(1),
  vendor: z.string(),
  invoice_no: z.string(),
  invoice_date_iso: z.string().nullable().optional(),
  gold_weight_g: z.number().nullable().optional(),
  gold_rate_per_g: z.number().nullable().optional(),
  metal_cost: z.number().nullable().optional(),
  labor_cost: z.number().nullable().optional(),
  other_charges: z.number().nullable().optional(),
  total: z.number(),
  currency: z.string(),
  payment_status: z.enum(["unpaid", "partial", "paid"]),
  paid_amount: z.number().nullable().optional(),
  paid_at_iso: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type InvoiceExportRow = z.infer<typeof invoiceExportRowSchema>;

/** LLM / review UI output for casting-style invoices (amounts in major currency units unless noted). */
export const extractedInvoiceSchema = z.object({
  vendor: z.string().nullable(),
  invoice_no: z.string().nullable(),
  invoice_date: z.string().nullable(),
  currency: z.string().nullable(),
  gold_weight_g: z.number().nullable(),
  /** Pennyweight (DWT) when shown on casting invoices */
  metal_weight_dwt: z.number().nullable().optional(),
  /** CAD / print / 3D model fee (USD) */
  print_fee: z.number().nullable().optional(),
  /** Metal / material line from invoice (e.g. 14K White Gold) */
  metal: z.string().nullable().optional(),
  /** Primary style / item code when visible outside line table */
  style_code: z.string().nullable().optional(),
  gold_rate_per_g: z.number().nullable(),
  metal_cost: z.number().nullable(),
  labor_cost: z.number().nullable(),
  other_charges: z.number().nullable(),
  total: z.number().nullable(),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number().nullable(),
        styleCode: z.string().nullable().optional(),
        metal: z.string().nullable().optional(),
        karat: z.string().nullable().optional(),
        qty: z.number().nullable().optional(),
        dwt: z.number().nullable().optional(),
        grams: z.number().nullable().optional(),
        printFee: z.number().nullable().optional(),
        lineTotal: z.number().nullable().optional(),
      }),
    )
    .optional(),
  product_ref: z.string().nullable(),
  confidence: z.record(z.number().min(0).max(1)).optional(),
});

export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

export const extractedMemoSchema = z.object({
  memo_id: z.string().nullable(),
  supplier: z.string().nullable(),
  stones_summary: z.string().nullable(),
  carat_total: z.number().nullable(),
  cost: z.number().nullable(),
  return_date: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.record(z.number().min(0).max(1)).optional(),
});

export type ExtractedMemo = z.infer<typeof extractedMemoSchema>;
