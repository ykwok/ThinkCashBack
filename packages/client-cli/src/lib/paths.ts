import * as path from "path";

/**
 * Absolute path to the installed statusline executable.
 *
 * When installed via npm, the `thinkcashback-statusline` bin is symlinked
 * onto PATH, but Claude Code's `statusLine` needs an absolute path it can
 * exec. We resolve it relative to this compiled module: dist/lib/paths.js
 * → dist/statusline/index.js.
 *
 * Override with THINKCASHBACK_STATUSLINE_BIN for local development.
 */
export function statusLineBinPath(): string {
  if (process.env.THINKCASHBACK_STATUSLINE_BIN) {
    return process.env.THINKCASHBACK_STATUSLINE_BIN;
  }
  return path.resolve(__dirname, "..", "statusline", "index.js");
}

/**
 * True if a settings `statusLine` value points at our statusline script.
 * Prefers an exact match against the canonical bin path, with a substring
 * heuristic as a fallback (covers manual edits and npm-global install paths).
 */
export function isManagedStatusLine(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value === statusLineBinPath()) return true;
  return /thinkcashback[\\/].*statusline/i.test(value);
}
