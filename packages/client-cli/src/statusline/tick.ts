#!/usr/bin/env node
/**
 * ThinkCashBack detached statusline worker.
 *
 * Spawned (detached, unref'd) by the run-once renderer on each status update so
 * the network work never blocks the status bar. One invocation does, at most:
 *   • fetch a fresh ad and merge it into the local cache (throttled),
 *   • refresh the spinnerVerbs in the Claude settings (best-effort),
 *   • report ONE signed impression for the ad currently shown (throttled),
 * then exits. All steps are best-effort and swallow errors.
 *
 * Throttle timestamps live in ~/.thinkcashback/statusline-state.json so rapid
 * status re-renders don't hammer the API or trip the server dedup window.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { configDir, isRegistered, readConfig } from "../lib/config";
import { mergeAd, readCache, writeCache } from "../lib/cache";
import { buildSignedImpression } from "../lib/impression";
import { currentPlatform } from "../lib/device";
import { ThinkCashBackApi } from "../lib/api";

const AD_FETCH_MS = 45_000;
const IMPRESSION_MIN_MS = 5_000;

interface TickState {
  lastFetch?: number;
  lastImpression?: number;
}

function statePath(): string {
  return path.join(configDir(), "statusline-state.json");
}

async function readState(): Promise<TickState> {
  try {
    return JSON.parse(await fs.readFile(statePath(), "utf8")) as TickState;
  } catch {
    return {};
  }
}

async function writeState(state: TickState): Promise<void> {
  try {
    await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
    await fs.writeFile(statePath(), JSON.stringify(state), { mode: 0o600 });
  } catch {
    /* throttle state is an optimization; ignore write failures */
  }
}

async function main(): Promise<void> {
  const shownCampaignId = process.argv[2];
  const config = await readConfig();
  const api = new ThinkCashBackApi(config);
  const state = await readState();
  const now = Date.now();

  // 1. Fetch a fresh ad into the local cache (throttled). We intentionally do
  //    NOT touch spinnerVerbs — current Claude Code rejects an array-shaped
  //    spinnerVerbs and skips the whole settings file on a schema error.
  if (now - (state.lastFetch ?? 0) > AD_FETCH_MS) {
    try {
      const ad = await api.getAd({
        platform: currentPlatform(),
        country: process.env.THINKCASHBACK_COUNTRY,
        lang: (process.env.LANG || "en").split(/[._]/)[0],
      });
      const cache = await readCache();
      const ads = mergeAd(cache.ads, ad);
      await writeCache(ads, new Date(now).toISOString());
      state.lastFetch = now;
    } catch {
      /* offline: keep serving the cache */
    }
  }

  // 2. Report a signed impression for the shown ad (throttled; skip house ads).
  if (
    shownCampaignId &&
    !shownCampaignId.startsWith("builtin") &&
    isRegistered(config) &&
    now - (state.lastImpression ?? 0) > IMPRESSION_MIN_MS
  ) {
    try {
      const durationMs = state.lastImpression ? now - state.lastImpression : IMPRESSION_MIN_MS;
      const payload = buildSignedImpression(
        { campaign_id: shownCampaignId, device_id: config.device_id!, duration_ms: durationMs },
        config.signing_secret!
      );
      await api.reportImpression(payload);
      state.lastImpression = now;
    } catch {
      /* drop a single heartbeat rather than retry-storm */
    }
  }

  await writeState(state);
}

main().catch(() => process.exit(0));
