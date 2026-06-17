/**
 * Live precious-metal spot prices.
 *
 * Primary source: gold-api.com — a free, keyless JSON feed that returns live
 * USD/troy-oz quotes (XAU/XAG/XPT). Manhattan Gold & Silver's public feed is
 * kept as a secondary source (it has been returning 502s), and a static
 * reference is the last resort so the cards always render something sane.
 *
 * @see https://gold-api.com
 * @see https://www.mgsrefining.com/resources/current-precious-metal-prices/
 */
export const GOLD_API_BASE = "https://api.gold-api.com/price";
export const MGS_METAL_PRICES_URL =
  "https://www.mgsrefining.com/wp-json/mgs/v1/metal-prices";

export const TROY_OZ_TO_GRAMS = 31.1034768;

const PURITY_14K = 14 / 24;
const PURITY_18K = 18 / 24;

export type MgsRawMetal = {
  live_price?: string;
  bid?: string;
  ask?: string;
  high?: string;
  low?: string;
  change?: number;
  change_pct?: string;
};

export type MgsRawResponse = {
  date_updated?: string;
  gold?: MgsRawMetal;
  silver?: MgsRawMetal;
  platinum?: MgsRawMetal;
  palla?: MgsRawMetal;
  palladium?: MgsRawMetal;
};

export type MetalCard = {
  label: string;
  karat: string;
  perGram: number;
  perOz: number;
  changePct?: number | null;
};

export type MetalSource = "live" | "mgs" | "fallback";

/** Normalized spot prices (USD / troy oz) from whichever source answered. */
export type MetalSpot = {
  source: MetalSource;
  dateUpdated: string;
  goldOz: number;
  silverOz: number;
  platinumOz: number;
  goldChangePct: number | null;
  silverChangePct: number | null;
  platinumChangePct: number | null;
};

export type MetalsPayload = {
  updatedAt: string;
  dateUpdated: string;
  source: MetalSource;
  spot: {
    gold: { perOz: number; perGram: number };
    silver: { perOz: number; perGram: number };
    platinum: { perOz: number; perGram: number };
  };
  cards: {
    yellow14: MetalCard;
    white14: MetalCard;
    rose18: MetalCard;
    silver: MetalCard;
    platinum: MetalCard;
  };
};

/** Parse MGS number strings (commas, scientific notation). */
export function parseMgsNum(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return parseFloat(String(value).replace(/,/g, "")) || 0;
}

function spotPerOz(metal: MgsRawMetal | undefined): number {
  if (!metal) return 0;
  const live = parseMgsNum(metal.live_price);
  if (live > 0) return live;
  const bid = parseMgsNum(metal.bid);
  if (bid > 0) return bid;
  return parseMgsNum(metal.ask);
}

function parseChangePct(metal: MgsRawMetal | undefined): number | null {
  if (!metal?.change_pct) return null;
  const n = parseFloat(String(metal.change_pct).replace(/%/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Reference spot (USD/troy oz) if every live source is unreachable. */
const FALLBACK_OZ = {
  gold: 4325,
  silver: 70.5,
  platinum: 1785,
};

function nowEt(): string {
  return (
    new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " ET"
  );
}

/** Build the card payload from normalized spot prices (or null → static fallback). */
export function buildMetalsPayload(spot: MetalSpot | null): MetalsPayload {
  const source: MetalSource = spot?.source ?? "fallback";
  const goldOz = spot && spot.goldOz > 0 ? spot.goldOz : FALLBACK_OZ.gold;
  const silverOz = spot && spot.silverOz > 0 ? spot.silverOz : FALLBACK_OZ.silver;
  const platinumOz = spot && spot.platinumOz > 0 ? spot.platinumOz : FALLBACK_OZ.platinum;

  const goldPerGram = goldOz / TROY_OZ_TO_GRAMS;
  const silverPerGram = silverOz / TROY_OZ_TO_GRAMS;
  const platinumPerGram = platinumOz / TROY_OZ_TO_GRAMS;

  const dateUpdated = spot?.dateUpdated?.trim() || nowEt();
  const goldChg = spot?.goldChangePct ?? null;
  const silverChg = spot?.silverChangePct ?? null;
  const platinumChg = spot?.platinumChangePct ?? null;

  return {
    updatedAt: new Date().toISOString(),
    dateUpdated,
    source,
    spot: {
      gold: { perOz: goldOz, perGram: goldPerGram },
      silver: { perOz: silverOz, perGram: silverPerGram },
      platinum: { perOz: platinumOz, perGram: platinumPerGram },
    },
    cards: {
      yellow14: {
        label: "14K Yellow Gold",
        karat: "14K · 58.3%",
        perGram: goldPerGram * PURITY_14K,
        perOz: goldOz * PURITY_14K,
        changePct: goldChg,
      },
      white14: {
        label: "14K White Gold",
        karat: "14K · 58.3%",
        perGram: goldPerGram * PURITY_14K,
        perOz: goldOz * PURITY_14K,
        changePct: goldChg,
      },
      rose18: {
        label: "18K Rose Gold",
        karat: "18K · 75%",
        perGram: goldPerGram * PURITY_18K,
        perOz: goldOz * PURITY_18K,
        changePct: goldChg,
      },
      silver: {
        label: "Silver",
        karat: ".999 fine",
        perGram: silverPerGram,
        perOz: silverOz,
        changePct: silverChg,
      },
      platinum: {
        label: "Platinum",
        karat: "950 ref.",
        perGram: platinumPerGram,
        perOz: platinumOz,
        changePct: platinumChg,
      },
    },
  };
}

/** True when an ET date string ("Mon D, YYYY …") is before today (America/New_York). */
export function isMetalsDateStale(dateUpdated: string | undefined): boolean {
  if (!dateUpdated?.trim()) return true;
  const m = dateUpdated.trim().match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return true;
  const [, month, day, year] = m;
  const mgsDay = new Date(`${month} ${day}, ${year} 12:00:00`);
  if (Number.isNaN(mgsDay.getTime())) return true;
  const todayEt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  mgsDay.setHours(0, 0, 0, 0);
  todayEt.setHours(0, 0, 0, 0);
  return mgsDay.getTime() < todayEt.getTime();
}

type GoldApiResponse = { price?: number; updatedAt?: string };

async function fetchGoldApiPrice(symbol: string): Promise<number> {
  // gold-api.com 404s on ANY query string, so cache-busting is done purely via
  // `cache: "no-store"` + the no-cache header — never append `?_=...` here.
  const res = await fetch(`${GOLD_API_BASE}/${symbol}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`gold-api ${symbol} HTTP ${res.status}`);
  const data = (await res.json()) as GoldApiResponse;
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`gold-api ${symbol} bad price`);
  return price;
}

/** Primary live source — keyless USD/oz quotes. Returns null if it can't be reached. */
export async function fetchGoldApiSpot(): Promise<MetalSpot | null> {
  try {
    const [goldOz, silverOz, platinumOz] = await Promise.all([
      fetchGoldApiPrice("XAU"),
      fetchGoldApiPrice("XAG"),
      fetchGoldApiPrice("XPT"),
    ]);
    return {
      source: "live",
      dateUpdated: nowEt(),
      goldOz,
      silverOz,
      platinumOz,
      goldChangePct: null,
      silverChangePct: null,
      platinumChangePct: null,
    };
  } catch (err) {
    console.warn("[metals] gold-api unavailable, trying fallback:", (err as Error)?.message);
    return null;
  }
}

export async function fetchMgsMetals(bustCache = false): Promise<MgsRawResponse | null> {
  try {
    const url = bustCache
      ? `${MGS_METAL_PRICES_URL}?_=${Date.now()}`
      : MGS_METAL_PRICES_URL;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        // Browser-like UA — the MGS WordPress endpoint is friendlier to it.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        ...(bustCache ? { "Cache-Control": "no-cache", Pragma: "no-cache" } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MgsRawResponse & { error?: string };
    // The endpoint sometimes answers 200 with {"error":"upstream_unavailable"}.
    if (data?.error || !data?.gold) return null;
    return data;
  } catch {
    return null;
  }
}

function mgsToSpot(raw: MgsRawResponse | null): MetalSpot | null {
  if (!raw?.gold) return null;
  const goldOz = spotPerOz(raw.gold);
  if (goldOz <= 0) return null;
  return {
    source: "mgs",
    dateUpdated: raw.date_updated?.trim() || nowEt(),
    goldOz,
    silverOz: spotPerOz(raw.silver),
    platinumOz: spotPerOz(raw.platinum),
    goldChangePct: parseChangePct(raw.gold),
    silverChangePct: parseChangePct(raw.silver),
    platinumChangePct: parseChangePct(raw.platinum),
  };
}

/**
 * Try live sources in order: Manhattan Gold & Silver (the dealer rates the shop
 * actually prices against) first, then gold-api as a fallback if MGS is down,
 * then null → static reference. Returns null only if every source fails.
 */
export async function fetchMetalSpot(bustCache = false): Promise<MetalSpot | null> {
  const mgs = mgsToSpot(await fetchMgsMetals(bustCache));
  if (mgs) return mgs;
  return fetchGoldApiSpot();
}
