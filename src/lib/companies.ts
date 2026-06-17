/**
 * Company registry shared across the React pages, the orders iframe app, and the
 * memo page. Stored in localStorage so all three read the same names/branding;
 * editable in Settings → Companies. LabGrownBox split into two businesses:
 * LabGrownBox and Sakk Fine Jewelry.
 */
export type Company = {
  id: string;
  name: string;
  short: string;
  accent: string;
  address?: string;
  taxId?: string;
  logo?: string;
};

export const COMPANIES_KEY = "lgb_companies";
export const ACTIVE_COMPANY_KEY = "lgb_active_company";

export const DEFAULT_COMPANIES: Company[] = [
  { id: "lgb", name: "LabGrownBox", short: "LGB", accent: "#0d2b6e", address: "", taxId: "", logo: "/lgb/nav-logo.png" },
  { id: "sakk", name: "Sakk Fine Jewelry", short: "Sakk", accent: "#9c2a4e", address: "", taxId: "", logo: "" },
];

export function loadCompanies(): Company[] {
  if (typeof window === "undefined") return DEFAULT_COMPANIES;
  try {
    const raw = window.localStorage.getItem(COMPANIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length) return parsed as Company[];
    }
  } catch {
    /* ignore — fall back to defaults */
  }
  return DEFAULT_COMPANIES;
}

export function saveCompanies(list: Company[]): void {
  try {
    window.localStorage.setItem(COMPANIES_KEY, JSON.stringify(list));
  } catch {
    /* ignore — storage may be unavailable */
  }
}

export function companyById(id: string | undefined, list: Company[]): Company | undefined {
  return list.find((c) => c.id === id);
}

export function companyName(id: string | undefined, list: Company[]): string {
  return companyById(id, list)?.name ?? "—";
}

export function loadActiveCompany(): string {
  if (typeof window === "undefined") return DEFAULT_COMPANIES[0].id;
  try {
    return window.localStorage.getItem(ACTIVE_COMPANY_KEY) || DEFAULT_COMPANIES[0].id;
  } catch {
    return DEFAULT_COMPANIES[0].id;
  }
}
