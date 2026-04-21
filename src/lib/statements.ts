import { prisma } from "@/lib/prisma";

export function normalizeInvoiceToken(s: string): string {
  return s.trim().replace(/\s+/g, "");
}

export async function findInvoicesByNumbers(rawNumbers: string[]) {
  const tokens = [...new Set(rawNumbers.map(normalizeInvoiceToken).filter(Boolean))];
  const matched: {
    token: string;
    invoice: Awaited<ReturnType<typeof prisma.vendorInvoice.findFirst>>;
  }[] = [];
  const missing: string[] = [];

  for (const t of tokens) {
    const inv = await prisma.vendorInvoice.findFirst({
      where: {
        OR: [{ invoiceNo: t }, { invoiceNo: t.toUpperCase() }, { invoiceNo: t.toLowerCase() }],
      },
      include: { product: true },
    });
    if (!inv) missing.push(t);
    else matched.push({ token: t, invoice: inv });
  }

  const sumCents = matched.reduce((s, m) => s + (m.invoice?.totalCents ?? 0), 0);
  return { matched, missing, sumCents };
}
