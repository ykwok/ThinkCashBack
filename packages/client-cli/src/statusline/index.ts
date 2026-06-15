#!/usr/bin/env node
/**
 * ThinkCashBack statusLine daemon.
 *
 * Claude Code execs this script (via the `statusLine` setting) and renders its
 * stdout in the bottom status bar. Responsibilities:
 *   • every AD_FETCH_MS: pull fresh ads from the API into the local cache
 *   • every TICK_MS:     print the current ad headline to stdout
 *   • every TICK_MS:     report a signed impression heartbeat
 *   • every ROTATE_MS:   advance to the next cached ad
 *   • every VERBS_MS:    refresh spinnerVerbs in ~/.claude/settings.json
 *   • SIGTERM/SIGINT:    flush and exit cleanly
 *
 * It is defensive by design: any network or filesystem error degrades to the
 * cache (or built-in fallback ads) instead of crashing, because a crash here
 * would break the user's Claude Code status bar.
 */
import { ThinkCashBackApi } from "../lib/api";
import { isRegistered, readConfig } from "../lib/config";
import { FALLBACK_ADS, mergeAd, readCache, writeCache } from "../lib/cache";
import { buildSignedImpression } from "../lib/impression";
import { currentPlatform } from "../lib/device";
import { refreshSpinnerVerbs } from "../lib/spinner-update";
import { Ad, LocalConfig } from "../types";

const TICK_MS = 5000;
const AD_FETCH_MS = 45000;
const ROTATE_MS = 60000;
const VERBS_MS = 120000;

class StatusLineDaemon {
  private ads: Ad[] = FALLBACK_ADS;
  private index = 0;
  private api: ThinkCashBackApi;
  private timers: NodeJS.Timeout[] = [];
  private shuttingDown = false;
  private lastTick = Date.now();

  constructor(private config: LocalConfig) {
    this.api = new ThinkCashBackApi(config);
  }

  async start(): Promise<void> {
    const cache = await readCache();
    if (cache.ads.length > 0) this.ads = cache.ads;

    await this.fetchAd(); // warm immediately
    this.print(); // render right away so the bar isn't empty

    this.timers.push(setInterval(() => this.tick(), TICK_MS));
    this.timers.push(setInterval(() => this.fetchAd(), AD_FETCH_MS));
    this.timers.push(setInterval(() => this.rotate(), ROTATE_MS));
    this.timers.push(setInterval(() => this.updateVerbs(), VERBS_MS));

    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  /** Per-tick: render the current ad and report an impression. */
  private tick(): void {
    const now = Date.now();
    const duration = now - this.lastTick;
    this.lastTick = now;
    this.print();
    void this.reportImpression(duration);
  }

  private print(): void {
    const ad = this.current();
    if (ad) process.stdout.write(ad.headline + "\n");
  }

  private current(): Ad | undefined {
    if (this.ads.length === 0) return undefined;
    return this.ads[this.index % this.ads.length];
  }

  private rotate(): void {
    if (this.ads.length > 0) this.index = (this.index + 1) % this.ads.length;
  }

  private async fetchAd(): Promise<void> {
    try {
      const ad = await this.api.getAd({
        platform: currentPlatform(),
        country: process.env.THINKCASHBACK_COUNTRY,
        lang: (process.env.LANG || "en").split(/[._]/)[0],
      });
      this.ads = mergeAd(this.ads, ad);
      await writeCache(this.ads, new Date().toISOString());
    } catch {
      // Offline: keep showing whatever is cached.
    }
  }

  private async reportImpression(durationMs: number): Promise<void> {
    const ad = this.current();
    if (!ad || !isRegistered(this.config)) return;
    try {
      const payload = buildSignedImpression(
        {
          // The server keys impressions by campaign UUID; `ad.id` is that UUID
          // while `ad.trackingId` is a per-serve random token (would 404/422).
          campaign_id: ad.id,
          device_id: this.config.device_id!,
          duration_ms: durationMs,
        },
        this.config.signing_secret!
      );
      await this.api.reportImpression(payload);
    } catch {
      // Drop a single heartbeat rather than crash; next tick retries.
    }
  }

  private async updateVerbs(): Promise<void> {
    try {
      await refreshSpinnerVerbs(this.ads);
    } catch {
      // settings.json refresh is best-effort.
    }
  }

  private shutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const t of this.timers) clearInterval(t);
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const config = await readConfig();
  const daemon = new StatusLineDaemon(config);
  await daemon.start();
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main().catch((err) => {
    // Last-resort guard: never throw out of the daemon entrypoint.
    process.stderr.write(`thinkcashback-statusline failed to start: ${(err as Error).message}\n`);
    process.exit(1);
  });
}

export { StatusLineDaemon };
