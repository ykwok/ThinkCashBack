import { Ad } from "../types";
import { isAdVerb, readClaudeSettings, writeClaudeSettings } from "./settings";

const MAX_AD_VERBS = 3;

/**
 * Convert an ad into a spinnerVerb string. The marker characters (✶ … ↗) tag
 * it as ours so install/uninstall can distinguish ad verbs from user verbs.
 */
export function adToVerb(ad: Ad): string {
  const headline = ad.headline.trim();
  // Re-use the headline if it already carries our markers; otherwise wrap it.
  if (isAdVerb(headline)) return headline;
  return `✶ ${headline} ↗`;
}

/**
 * Refresh the ThinkCashBack ad verbs in ~/.claude/settings.json from the
 * given ads, preserving the user's own verbs. Pure-ish: reads and writes
 * settings, but the merge logic is deterministic and testable via mergeVerbs.
 */
export async function refreshSpinnerVerbs(ads: Ad[]): Promise<void> {
  const settings = await readClaudeSettings();
  if (settings === null) return; // nothing to update if Claude Code isn't configured

  const existing = Array.isArray(settings.spinnerVerbs)
    ? (settings.spinnerVerbs as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const merged = mergeVerbs(existing, ads);
  // Avoid a needless write if nothing changed.
  if (sameVerbs(existing, merged)) return;

  settings.spinnerVerbs = merged;
  await writeClaudeSettings(settings);
}

/**
 * Replace our ad verbs with fresh ones drawn from `ads`, keeping every
 * non-ad (user) verb exactly where order allows. Ad verbs go first.
 */
export function mergeVerbs(existing: string[], ads: Ad[]): string[] {
  const userVerbs = existing.filter((v) => !isAdVerb(v));
  const adVerbs = ads.slice(0, MAX_AD_VERBS).map(adToVerb);
  return [...adVerbs, ...userVerbs];
}

function sameVerbs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
