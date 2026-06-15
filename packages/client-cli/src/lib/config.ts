import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { LocalConfig } from "../types";

const DEFAULT_API_BASE = "https://api.thinkcashback.dev";

/** Directory that holds all ThinkCashBack local state. */
export function configDir(): string {
  return process.env.THINKCASHBACK_HOME || path.join(os.homedir(), ".thinkcashback");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function cachePath(): string {
  return path.join(configDir(), "cache.json");
}

/** Resolve the API base URL: env override > stored config > default. */
export function apiBase(config: LocalConfig): string {
  return process.env.THINKCASHBACK_API_BASE || config.api_base || DEFAULT_API_BASE;
}

/** Read the local config, returning an empty object when nothing is stored yet. */
export async function readConfig(): Promise<LocalConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return JSON.parse(raw) as LocalConfig;
  } catch (err: unknown) {
    if (isNotFound(err)) return {};
    // A corrupt config should not crash the CLI; treat it as empty.
    return {};
  }
}

/**
 * Persist the local config with owner-only (0600) permissions.
 * The file holds the signing_secret and JWT, so it must never be world-readable.
 */
export async function writeConfig(config: LocalConfig): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = configPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fs.rename(tmp, configPath());
  // rename can preserve prior perms on some platforms; enforce explicitly.
  await fs.chmod(configPath(), 0o600);
}

/** True once the device is registered and we have credentials to report impressions. */
export function isRegistered(config: LocalConfig): boolean {
  return Boolean(config.device_id && config.api_key && config.signing_secret);
}

export function isLoggedIn(config: LocalConfig): boolean {
  return Boolean(config.jwt);
}

function isNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as NodeJS.ErrnoException).code === "ENOENT");
}
