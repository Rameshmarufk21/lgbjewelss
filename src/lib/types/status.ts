export const PRODUCT_STATUSES = [
  "cad_sent",
  "casting",
  "stones",
  "setter",
  "qc",
  "sold",
  "archived",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ASSET_TYPES = [
  "cad_file",
  "cad_render",
  "invoice_casting",
  "memo",
  "invoice_finding",
  "invoice_other",
  "photo",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "needs_review",
  "completed",
  "failed",
] as const;

export type ExtractionJobStatus = (typeof EXTRACTION_STATUSES)[number];

export function isProductStatus(v: string): v is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(v);
}

export function isPaymentStatus(v: string): v is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(v);
}
