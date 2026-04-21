import type { PaymentStatus } from "@/lib/types/status";
import { prisma } from "@/lib/prisma";

function rollupPayment(a: PaymentStatus, b: PaymentStatus): PaymentStatus {
  const rank: Record<PaymentStatus, number> = {
    unpaid: 0,
    partial: 1,
    paid: 2,
  };
  return rank[a] < rank[b] ? a : b;
}

export async function computeProductFinancials(productId: string) {
  const [invoices, stones, findings] = await Promise.all([
    prisma.vendorInvoice.findMany({ where: { productId } }),
    prisma.stoneAssignment.findMany({ where: { productId } }),
    prisma.findingPurchase.findMany({ where: { productId } }),
  ]);

  const totalCastingCents = invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalStonesCents = stones.reduce(
    (s, x) => s + (x.costCents ?? 0),
    0,
  );
  const totalFindingsCents = findings.reduce((s, x) => s + x.costCents, 0);
  const grandCostCents = totalCastingCents + totalStonesCents + totalFindingsCents;

  let invoicePaymentStatus: PaymentStatus = "paid";
  if (invoices.length === 0) invoicePaymentStatus = "paid";
  else {
    for (const inv of invoices) {
      const ps = inv.paymentStatus as PaymentStatus;
      invoicePaymentStatus = rollupPayment(invoicePaymentStatus, ps);
    }
  }

  return {
    totalCastingCents,
    totalStonesCents,
    totalFindingsCents,
    grandCostCents,
    invoicePaymentStatus,
  };
}
