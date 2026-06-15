import { promises as fs } from "fs";
import { Ad, AdCache } from "../types";
import { cachePath, configDir } from "./config";

const MAX_CACHED_ADS = 10;

/** A few built-in ads so the statusline shows something even on a cold cache. */
export const FALLBACK_ADS: Ad[] = [
  {
    id: "builtin-1",
    headline: "✶ ThinkCashBack — get paid while you think ↗",
    url: "https://thinkcashback.dev",
    trackingId: "builtin-1",
  },
];

/** Read the on-disk ad cache. Returns an empty cache when missing or corrupt. */
export async function readCache(): Promise<AdCache> {
  try {
    const raw = await fs.readFile(cachePath(), "utf8");
    const parsed = JSON.parse(raw) as AdCache;
    if (!Array.isArray(parsed.ads)) return emptyCache();
    return parsed;
  } catch {
    return emptyCache();
  }
}

/** Persist up to MAX_CACHED_ADS ads. Best-effort: failures are swallowed. */
export async function writeCache(ads: Ad[], nowIso: string): Promise<void> {
  try {
    await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
    const cache: AdCache = { ads: ads.slice(0, MAX_CACHED_ADS), fetched_at: nowIso };
    await fs.writeFile(cachePath(), JSON.stringify(cache, null, 2), { mode: 0o600 });
  } catch {
    // Cache is an optimization; never let a write failure break the statusline.
  }
}

/**
 * Merge a freshly fetched ad into the cache (dedup by id, newest first),
 * trimmed to MAX_CACHED_ADS.
 */
export function mergeAd(existing: Ad[], fresh: Ad): Ad[] {
  const deduped = existing.filter((a) => a.id !== fresh.id);
  return [fresh, ...deduped].slice(0, MAX_CACHED_ADS);
}

function emptyCache(): AdCache {
  return { ads: [], fetched_at: "" };
}
