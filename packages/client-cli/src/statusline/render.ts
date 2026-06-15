#!/usr/bin/env node
/**
 * ThinkCashBack run-once statusLine renderer.
 *
 * Claude Code's `statusLine` runs a command on every status update, pipes the
 * session JSON on stdin, and renders the command's stdout (run-once — the
 * command must print and exit). This renderer:
 *   1. reads the session JSON from stdin,
 *   2. runs the WRAPPED status line (e.g. claude-hud) with that same stdin and
 *      captures its output, so the two coexist on one statusLine slot,
 *   3. picks the current ad (time-based rotation over the local cache),
 *   4. prints the wrapped output and the ad on its own line below it,
 *   5. spawns a DETACHED worker (tick.js) to fetch fresh ads + report a signed
 *      impression, so neither network call blocks the status line,
 *   6. exits immediately.
 *
 * It is defensive by design: any failure degrades (no ad, or no wrapped line)
 * rather than breaking the user's status bar.
 */
import { spawn } from "child_process";
import * as path from "path";
import { readConfig } from "../lib/config";
import { FALLBACK_ADS, readCache } from "../lib/cache";
import { adToVerb } from "../lib/spinner-update";
import { Ad } from "../types";

/** Ad rotation period. Stateless: index is derived from wall-clock time. */
const ROTATE_MS = 60_000;
const STDIN_TIMEOUT_MS = 600;
const WRAPPED_TIMEOUT_MS = 2500;

/** Read all of stdin (the Claude Code session JSON), with a timeout fallback. */
function readStdin(): Promise<Buffer> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(Buffer.alloc(0));
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    };
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, STDIN_TIMEOUT_MS);
  });
}

/** Run the wrapped status line command, feeding it stdin; return its stdout (or ""). */
function runWrapped(cmd: string, stdin: Buffer): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (s: string): void => {
      if (done) return;
      done = true;
      resolve(s);
    };
    try {
      const child = spawn("sh", ["-c", cmd], { stdio: ["pipe", "pipe", "ignore"] });
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        finish(out);
      }, WRAPPED_TIMEOUT_MS);
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.on("close", () => {
        clearTimeout(timer);
        finish(out);
      });
      child.on("error", () => {
        clearTimeout(timer);
        finish("");
      });
      child.stdin.on("error", () => {
        /* wrapped command may not read stdin */
      });
      child.stdin.write(stdin);
      child.stdin.end();
    } catch {
      finish("");
    }
  });
}

/** Pick the ad to show, rotating over the cache every ROTATE_MS (stateless). */
export function currentAd(ads: Ad[], now: number = Date.now()): Ad {
  const pool = ads.length > 0 ? ads : FALLBACK_ADS;
  const index = Math.floor(now / ROTATE_MS) % pool.length;
  return pool[index];
}

/** Compose the final status line: wrapped output first, ad on its own line below. */
export function composeStatusLine(wrapped: string, ad: Ad): string {
  const hud = wrapped.replace(/\n+$/, "");
  const adLine = adToVerb(ad);
  return hud ? `${hud}\n${adLine}` : adLine;
}

/** Spawn the detached fetch + impression worker; never blocks rendering. */
function spawnTick(campaignId: string): void {
  try {
    const tickPath = path.resolve(__dirname, "tick.js");
    const child = spawn(process.execPath, [tickPath, campaignId], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    /* best effort */
  }
}

async function main(): Promise<void> {
  const stdin = await readStdin();
  const config = await readConfig();

  // 1. The wrapped status line (e.g. claude-hud), if any.
  let wrapped = "";
  if (config.wrapped_status_line) {
    wrapped = await runWrapped(config.wrapped_status_line, stdin);
  }

  // 2. The current ad, composed below the wrapped line.
  const cache = await readCache();
  const ad = currentAd(cache.ads);
  process.stdout.write(composeStatusLine(wrapped, ad) + "\n");

  // 3. Background fetch + signed impression (detached). Always spawn so a cold
  //    cache gets warmed; tick itself skips impression reporting for house ads.
  spawnTick(ad.id);
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main().catch(() => {
    // Last resort: never break the status bar. Print nothing rather than throw.
    process.exit(0);
  });
}
