export type StoredStone = {
  category?: string;
  itemCategory?: string;
  shape?: string;
  colorGrade?: string;
  color?: string;
  clarityGrade?: string;
  clarity?: string;
  carat?: string | number;
  carats?: string | number;
  sourcing?: string;
  certificateNumber?: string;
  certNumber?: string;
  certificateLab?: string;
  certLab?: string;
  supplier?: string;
  cost?: string | number;
  notes?: string;
};

export type OrderRow = {
  id?: string;
  company?: string;
  styleCode?: string;
  productType?: string;
  createdAt?: string;
  castVendor?: string;
  castInvoice?: string;
  castDate?: string;
  castTotal?: string | number;
  setter?: string;
  setInvoice?: string;
  setDate?: string;
  setTotal?: string | number;
  setPrice?: string | number;
  setLabor?: string | number;
  stoneShape?: string;
  stoneCt?: string | number;
  stoneCert?: string;
  stoneTotal?: string | number;
  stoneMM?: string;
  stones?: StoredStone[];
};

export type StoredPayment = {
  id: string;
  paidTo: string;
  category: string;
  amount: number;
  paidOn: string;
  orderId?: string;
  note?: string;
};

export type StatementLine = {
  orderId: string;
  date: string;
  product: string;
  amount: number | null;
  status: string;
  medium: string;
  invoiceNo: string | null;
};

export type StatementInvoice = {
  no: string;
  lines: StatementLine[];
};

export type VendorStatementGroup = {
  vendor: string;
  invoices: StatementInvoice[];
  cardLines: StatementLine[];
};

export function vendorCanon(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  const lc = v.toLowerCase();
  if (/\bmta\b/.test(lc) || /casting\s+hub/.test(lc)) return "MTA";
  if (/\bcarat\b/.test(lc)) return "CARAT";
  if (/\bmc\s*production\b/.test(lc) || /^mc\b/.test(lc)) return "MC";
  if (/^victor/.test(lc)) return "Victor";
  if (/jymp/.test(lc)) return "JYMP";
  if (/^edwin/.test(lc)) return "Edwin";
  return v;
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

function mediumFromNote(note?: string): string {
  if (!note?.trim()) return "";
  const lc = note.toLowerCase();
  if (/zelle/.test(lc)) return "Zelle";
  if (/cash/.test(lc)) return "Cash";
  if (/check|cheque/.test(lc)) return "Check";
  if (/wire|transfer|ach|venmo/.test(lc)) return "Transfer";
  return note.trim();
}

function vendorMatch(paidTo: string, vendorKey: string): boolean {
  const a = paidTo.toLowerCase();
  const b = vendorKey.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function paymentMeta(
  orderId: string | undefined,
  vendorKey: string,
  amount: number | null,
  payments: StoredPayment[],
  category: "casting" | "setter",
): { status: string; medium: string } {
  if (orderId) {
    const byOrder = payments.find((p) => p.orderId === orderId && p.category === category);
    if (byOrder) return { status: "Paid", medium: mediumFromNote(byOrder.note) };
  }
  if (amount != null && amount > 0) {
    const byAmt = payments.find(
      (p) =>
        p.category === category &&
        vendorMatch(p.paidTo, vendorKey) &&
        Math.abs(p.amount - amount) < 0.02,
    );
    if (byAmt) return { status: "Paid", medium: mediumFromNote(byAmt.note) };
  }
  return { status: "", medium: "" };
}

function pickDate(primary?: string, fallback?: string): string {
  const d = (primary || fallback || "").trim();
  return d || "";
}

function buildLine(
  o: OrderRow,
  vendorKey: string,
  invoiceNo: string | null,
  amount: number | null,
  date: string,
  payments: StoredPayment[],
  category: "casting" | "setter",
): StatementLine {
  const { status, medium } = paymentMeta(o.id, vendorKey, amount, payments, category);
  return {
    orderId: o.id || "",
    date,
    product: (o.styleCode || o.productType || "—").trim(),
    amount,
    status,
    medium,
    invoiceNo,
  };
}

function setterAmount(o: OrderRow): number | null {
  const total = num(o.setTotal);
  if (total != null && total > 0) return total;
  const parts = [num(o.setPrice), num(o.setLabor)].filter((n): n is number => n != null && n > 0);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0);
}

function groupByVendor(
  orders: OrderRow[],
  vendorField: "castVendor" | "setter",
  invoiceField: "castInvoice" | "setInvoice",
  dateField: "castDate" | "setDate",
  amountField: "castTotal" | "setTotal",
  category: "casting" | "setter",
  payments: StoredPayment[],
): VendorStatementGroup[] {
  const map = new Map<string, { invoices: Map<string, StatementLine[]>; cardLines: StatementLine[] }>();

  for (const o of orders) {
    const rawVendor = o[vendorField];
    const vendor = vendorCanon(rawVendor) ?? (rawVendor?.trim() || null);
    if (!vendor) continue;

    const invoiceRaw = String(o[invoiceField] || "").trim();
    const amount =
      category === "setter" ? setterAmount(o) : num(o[amountField as keyof OrderRow]);
    const date = pickDate(o[dateField], o.createdAt);

    if (!invoiceRaw && (amount == null || amount <= 0)) continue;

    if (!map.has(vendor)) map.set(vendor, { invoices: new Map(), cardLines: [] });
    const bucket = map.get(vendor)!;

    const line = buildLine(o, vendor, invoiceRaw || null, amount, date, payments, category);

    if (invoiceRaw) {
      const list = bucket.invoices.get(invoiceRaw) ?? [];
      list.push(line);
      bucket.invoices.set(invoiceRaw, list);
    } else {
      bucket.cardLines.push(line);
    }
  }

  const groups: VendorStatementGroup[] = [];
  for (const [vendor, bucket] of map.entries()) {
    const invoices: StatementInvoice[] = [...bucket.invoices.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([no, lines]) => ({
        no,
        lines: lines.sort((x, y) => x.date.localeCompare(y.date)),
      }));

    const cardLines = bucket.cardLines.sort((a, b) => a.date.localeCompare(b.date));
    if (invoices.length === 0 && cardLines.length === 0) continue;
    groups.push({ vendor, invoices, cardLines });
  }

  return groups.sort((a, b) => a.vendor.localeCompare(b.vendor));
}

export function buildCastingStatements(orders: OrderRow[], payments: StoredPayment[]): VendorStatementGroup[] {
  return groupByVendor(orders, "castVendor", "castInvoice", "castDate", "castTotal", "casting", payments);
}

export function buildSetterStatements(orders: OrderRow[], payments: StoredPayment[]): VendorStatementGroup[] {
  return groupByVendor(orders, "setter", "setInvoice", "setDate", "setTotal", "setter", payments);
}

export function loadOrdersFromStorage(): OrderRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("lgb_orders");
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OrderRow[]) : [];
  } catch {
    return [];
  }
}

export function loadPaymentsFromStorage(): StoredPayment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("lgb_payments");
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as StoredPayment[]) : [];
  } catch {
    return [];
  }
}

export function fmtStatementDate(d: string): string {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T12:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type DiamondStatementLine = {
  orderId: string;
  styleCode: string;
  date: string;
  category: string;
  shape: string;
  carat: number | null;
  cert: string;
  cost: number | null;
  notes: string;
};

export type SupplierStatementGroup = {
  supplier: string;
  lines: DiamondStatementLine[];
};

export function buildDiamondStatements(orders: OrderRow[]): SupplierStatementGroup[] {
  const supplierGroups: Record<string, DiamondStatementLine[]> = {};

  orders.forEach((o) => {
    const dateStr = o.createdAt || "";
    const orderId = o.id || "";
    const styleCode = o.styleCode || "";

    if (Array.isArray(o.stones)) {
      o.stones.forEach((s) => {
        const costVal = num(s.cost);
        const supplierName = (s.supplier || "").trim() || "Unknown Supplier";
        
        if (costVal !== null || s.shape || s.carat) {
          if (!supplierGroups[supplierName]) {
            supplierGroups[supplierName] = [];
          }
          supplierGroups[supplierName].push({
            orderId,
            styleCode,
            date: dateStr,
            category: s.category || s.itemCategory || "diamond",
            shape: s.shape || "Stone",
            carat: num(s.carat),
            cert: s.certificateNumber || s.certNumber || "",
            cost: costVal,
            notes: s.notes || "",
          });
        }
      });
    }

    if ((!o.stones || o.stones.length === 0) && (num(o.stoneTotal) !== null || o.stoneShape)) {
      const supplierName = "Unknown Supplier";
      if (!supplierGroups[supplierName]) {
        supplierGroups[supplierName] = [];
      }
      supplierGroups[supplierName].push({
        orderId,
        styleCode,
        date: dateStr,
        category: "diamond",
        shape: o.stoneShape || "Stone",
        carat: num(o.stoneCt),
        cert: o.stoneCert || "",
        cost: num(o.stoneTotal),
        notes: o.stoneMM || "",
      });
    }
  });

  return Object.entries(supplierGroups).map(([supplier, lines]) => ({
    supplier,
    lines: lines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  })).sort((a, b) => a.supplier.localeCompare(b.supplier));
}
