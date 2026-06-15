import * as path from "path";

/**
 * Absolute path to the legacy persistent statusline daemon (dist/statusline/index.js).
 * Kept for the standalone `node …/statusline/index.js` watch mode; `install` now
 * wires the run-once renderer below instead. Override with THINKCASHBACK_STATUSLINE_BIN.
 */
export function statusLineBinPath(): string {
  if (process.env.THINKCASHBACK_STATUSLINE_BIN) {
    return process.env.THINKCASHBACK_STATUSLINE_BIN;
  }
  return path.resolve(__dirname, "..", "statusline", "index.js");
}

/**
 * Absolute path to the run-once statusline renderer (dist/statusline/render.js).
 * This is the command Claude Code execs on every status update: it runs the
 * wrapped (e.g. claude-hud) status line, appends the current ad, prints, and
 * spawns a detached worker for ad-fetch + impression reporting.
 *
 * Override with THINKCASHBACK_STATUSLINE_RENDER_BIN for local development.
 */
export function statusLineRenderPath(): string {
  if (process.env.THINKCASHBACK_STATUSLINE_RENDER_BIN) {
    return process.env.THINKCASHBACK_STATUSLINE_RENDER_BIN;
  }
  return path.resolve(__dirname, "..", "statusline", "render.js");
}

/**
 * The Claude Code `statusLine` value we install: an object-format command that
 * runs our renderer via `node` (so it needs no executable bit).
 */
export function managedStatusLine(): { type: "command"; command: string } {
  return { type: "command", command: `node ${JSON.stringify(statusLineRenderPath())}` };
}

/**
 * Extract a command string from a Claude Code `statusLine` value, which may be
 * a bare string (legacy) or an object `{ type: "command", command }` (current).
 */
export function statusLineCommand(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { command?: unknown }).command === "string"
  ) {
    return (value as { command: string }).command;
  }
  return null;
}

/**
 * True if a settings `statusLine` value points at our renderer (string or
 * object form). Used to keep install/uninstall idempotent and to recognize our
 * own wrapper on re-install so the original is not lost.
 */
export function isManagedStatusLine(value: unknown): boolean {
  const cmd = statusLineCommand(value);
  if (cmd === null) return false;
  return /thinkcashback[\\/].*statusline/i.test(cmd);
}
