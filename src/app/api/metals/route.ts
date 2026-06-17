import { NextResponse } from "next/server";
import {
  buildMetalsPayload,
  fetchMetalSpot,
  isMetalsDateStale,
  type MetalsPayload,
} from "@/lib/metals";

export const dynamic = "force-dynamic";

const REFRESH_COOLDOWN_MS = 60_000;
/** Serve cached rates without hitting MGS if younger than this (unless ?refresh=1). */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

type CacheEntry = {
  payload: MetalsPayload;
  fetchedAt: number;
};

const g = globalThis as typeof globalThis & { __lgbMetalsCache?: CacheEntry };

function getCache(): CacheEntry | undefined {
  return g.__lgbMetalsCache;
}

function setCache(payload: MetalsPayload) {
  g.__lgbMetalsCache = { payload, fetchedAt: Date.now() };
}

async function loadFresh(bustCache = false): Promise<MetalsPayload> {
  const spot = await fetchMetalSpot(bustCache);
  const payload = buildMetalsPayload(spot);
  // Only cache real (live/mgs) data — never pin the static fallback.
  if (payload.source !== "fallback") {
    setCache(payload);
  }
  return payload;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const now = Date.now();
  const cached = getCache();
  const cachedDateStale = cached ? isMetalsDateStale(cached.payload.dateUpdated) : true;

  if (refresh && cached && !cachedDateStale) {
    const elapsed = now - cached.fetchedAt;
    if (elapsed < REFRESH_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000);
      return json({
        ...cached.payload,
        cached: true,
        refreshBlocked: true,
        retryAfterSeconds,
        fetchedAt: cached.fetchedAt,
      });
    }
  }

  const cacheAge = cached ? now - cached.fetchedAt : Infinity;
  const memoryStale = !cached || cacheAge >= STALE_AFTER_MS;
  const mustRefetch = refresh || memoryStale || cachedDateStale;

  if (!mustRefetch && cached) {
    return json({
      ...cached.payload,
      cached: true,
      refreshBlocked: false,
      fetchedAt: cached.fetchedAt,
    });
  }

  const payload = await loadFresh(refresh || cachedDateStale);
  return json({
    ...payload,
    cached: false,
    refreshBlocked: false,
    fetchedAt: now,
  });
}
