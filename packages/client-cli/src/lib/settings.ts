import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { SettingsBackup } from "../types";
import { isManagedStatusLine, managedStatusLine, statusLineCommand } from "./paths";

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

export interface ApplyInstallOptions {
  /**
   * The backup recorded by a PRIOR install, if any. On re-install our own
   * wrapper is already in `statusLine`, so the true pre-install value must come
   * from here rather than from `current` (otherwise we'd wrap our own wrapper
   * and lose the user's original, e.g. claude-hud).
   */
  priorBackup?: SettingsBackup;
}

/**
 * Apply ThinkCashBack ad config to a settings object (pure — does not write).
 *
 * `statusLine` is set to our object-format wrapper command (run-once renderer
 * via `node`). The user's original statusLine (e.g. claude-hud) is preserved in
 * two places: `backup.original_status_line` (for byte-faithful uninstall) and
 * the returned `wrappedCommand` (for the renderer to re-run and append to).
 *
 * Only `spinnerVerbs` and `statusLine` are touched; all other keys are left
 * byte-for-byte intact. Idempotent: re-installing does not wrap our own wrapper.
 */
export function applyInstall(
  current: Settings,
  opts: ApplyInstallOptions = {}
): {
  settings: Settings;
  backup: SettingsBackup;
  wrappedCommand: string | undefined;
  installedAt: string;
} {
  const installedAt = new Date().toISOString();
  const next: Settings = { ...current };

  // --- spinnerVerbs ---
  // NOT managed. Current Claude Code expects `spinnerVerbs` to be an object and
  // rejects an array-shaped value — and a schema error makes it skip the ENTIRE
  // settings file (disabling statusLine, plugins, etc.). We therefore leave
  // spinnerVerbs untouched; ads render via statusLine only. We still record the
  // pre-existing value so uninstall can scrub any array written by older builds.
  const existingVerbs = Array.isArray(current.spinnerVerbs)
    ? (current.spinnerVerbs as unknown[]).filter((v): v is string => typeof v === "string")
    : undefined;
  const userVerbs = (existingVerbs ?? []).filter((v) => !isAdVerb(v));

  // --- statusLine ---
  const reinstall = isManagedStatusLine(current.statusLine);
  // The true pre-install statusLine: on re-install, recover it from the prior
  // backup; otherwise it's whatever is currently there.
  const hadStatusLine = reinstall
    ? opts.priorBackup?.had_status_line ?? false
    : Object.prototype.hasOwnProperty.call(current, "statusLine");
  const originalStatusLine = reinstall
    ? opts.priorBackup?.original_status_line
    : hadStatusLine
      ? current.statusLine
      : undefined;

  // The command we re-run inside the renderer is derived from the true original.
  const wrappedCommand = statusLineCommand(originalStatusLine) ?? undefined;

  next.statusLine = managedStatusLine();

  const backup: SettingsBackup = {
    had_spinner_verbs: existingVerbs !== undefined,
    original_spinner_verbs: userVerbs,
    had_status_line: hadStatusLine,
    original_status_line: hadStatusLine ? originalStatusLine : undefined,
    installed_at: installedAt,
  };

  return { settings: next, backup, wrappedCommand, installedAt };
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
