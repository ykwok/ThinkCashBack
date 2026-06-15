import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { SettingsBackup } from "../types";
import { isManagedStatusLine } from "./paths";

/** Marker prefix that tags every spinnerVerb we inject, so we can find & remove our own. */
export const AD_VERB_MARKER = "✶";
const AD_VERB_SUFFIX = "↗";

/** Placeholder verbs seeded at install time; the background updater replaces these. */
export const PLACEHOLDER_VERBS: string[] = [
  "✶ Loading your sponsored thought… ↗",
];

export function claudeSettingsPath(): string {
  return (
    process.env.CLAUDE_SETTINGS_PATH ||
    path.join(os.homedir(), ".claude", "settings.json")
  );
}

type Settings = Record<string, unknown> & {
  spinnerVerbs?: unknown;
  statusLine?: unknown;
};

/** True if a verb string was injected by ThinkCashBack. */
export function isAdVerb(verb: unknown): boolean {
  return typeof verb === "string" && verb.includes(AD_VERB_MARKER) && verb.includes(AD_VERB_SUFFIX);
}

/**
 * Read ~/.claude/settings.json. Returns null when the file does not exist,
 * so callers can decide whether to create it or prompt the user.
 */
export async function readClaudeSettings(): Promise<Settings | null> {
  try {
    const raw = await fs.readFile(claudeSettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Settings;
    return {};
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write settings back, pretty-printed, creating the .claude dir if needed. */
export async function writeClaudeSettings(settings: Settings): Promise<void> {
  const p = claudeSettingsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2) + "\n");
  await fs.rename(tmp, p);
}

/**
 * Apply ThinkCashBack ad config to a settings object (pure — does not write).
 * Returns the mutated settings plus a backup describing the pre-install state
 * so uninstall can restore exactly what the user had.
 *
 * Only `spinnerVerbs` and `statusLine` are touched; all other keys are left
 * byte-for-byte intact.
 */
export function applyInstall(
  current: Settings,
  statusLineScriptPath: string,
  verbs: string[] = PLACEHOLDER_VERBS
): { settings: Settings; backup: SettingsBackup; installedAt: string } {
  const installedAt = new Date().toISOString();
  const next: Settings = { ...current };

  // --- spinnerVerbs ---
  const existingVerbs = Array.isArray(current.spinnerVerbs)
    ? (current.spinnerVerbs as unknown[]).filter((v): v is string => typeof v === "string")
    : undefined;
  // Preserve the user's own verbs (drop any leftover ad verbs from a prior install).
  const userVerbs = (existingVerbs ?? []).filter((v) => !isAdVerb(v));
  next.spinnerVerbs = [...verbs, ...userVerbs];

  // --- statusLine ---
  const hadStatusLine = Object.prototype.hasOwnProperty.call(current, "statusLine");
  next.statusLine = statusLineScriptPath;

  const backup: SettingsBackup = {
    had_spinner_verbs: existingVerbs !== undefined,
    original_spinner_verbs: userVerbs,
    had_status_line: hadStatusLine,
    original_status_line: hadStatusLine ? current.statusLine : undefined,
    installed_at: installedAt,
  };

  return { settings: next, backup, installedAt };
}

/**
 * Restore settings to their pre-install state using the recorded backup
 * (pure — does not write). If no backup is available we still strip our own
 * ad verbs and statusLine so the user is left clean.
 */
export function applyUninstall(current: Settings, backup?: SettingsBackup): Settings {
  const next: Settings = { ...current };

  // --- spinnerVerbs ---
  const verbs = Array.isArray(current.spinnerVerbs)
    ? (current.spinnerVerbs as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const userVerbs = backup?.original_spinner_verbs ?? verbs.filter((v) => !isAdVerb(v));
  if (backup ? backup.had_spinner_verbs : userVerbs.length > 0) {
    next.spinnerVerbs = userVerbs;
  } else {
    delete next.spinnerVerbs;
  }

  // --- statusLine ---
  if (backup) {
    if (backup.had_status_line) {
      next.statusLine = backup.original_status_line;
    } else {
      delete next.statusLine;
    }
  } else {
    // No backup: only remove statusLine if it points at our script.
    if (isManagedStatusLine(current.statusLine)) {
      delete next.statusLine;
    }
  }

  return next;
}
