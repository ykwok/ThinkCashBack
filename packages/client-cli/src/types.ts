/**
 * Shared types for the ThinkCashBack CLI client.
 * API contract mirrors the backend (PRO-345).
 */

/** Platforms the server accepts (matches the shared `platformSchema` enum). */
export type Platform = "darwin" | "linux" | "win32";

/**
 * A single ad returned by GET /api/v1/ad.
 * Mirrors the server's `AdResponse` (camelCase, `id` is the campaign UUID and
 * `trackingId` is a per-serve random token — only `id` is valid as a
 * campaign_id when reporting impressions).
 */
export interface Ad {
  id: string;
  headline: string;
  url: string;
  trackingId: string;
}

/**
 * Response from POST /api/v1/devices (inside the `data` envelope).
 * The server returns the device under a nested object and the (re-issued)
 * developer credentials at the top level.
 */
export interface DeviceRegistration {
  device: {
    id: string;
    platform: Platform;
    createdAt: string;
  };
  apiKey: string;
  signingSecret: string;
}

/** Response from POST /api/v1/auth/github (inside the `data` envelope). */
export interface GithubAuthResult {
  token: string;
  developer: {
    id: string;
    githubId: string;
    email: string;
  };
  /** Present only on first login — persist immediately. */
  credentials: {
    apiKey: string;
    signingSecret: string;
  } | null;
}

/** Payload sent to POST /api/v1/impressions (matches `impressionReportSchema`). */
export interface ImpressionPayload {
  campaign_id: string;
  device_id: string;
  nonce: string;
  signature: string;
  duration_ms: number;
}

/**
 * Response from GET /api/v1/me/earnings (inside the `data` envelope).
 * Mirrors the server's `EarningsSummary`: amounts are integer cents.
 */
export interface Earnings {
  totalCents: number;
  pendingCents: number;
  paidCents: number;
  daily: Array<{
    date: string;
    impressions: number;
    grossCents: number;
    devShareCents: number;
  }>;
}

/** Locally stored credentials and settings (~/.thinkcashback/config.json). */
export interface LocalConfig {
  api_base?: string;
  jwt?: string;
  device_id?: string;
  api_key?: string;
  signing_secret?: string;
  /**
   * The original `statusLine` command we wrap (e.g. claude-hud), as a shell
   * command string. The run-once renderer executes this first, then appends the
   * ad, so the two coexist on one Claude Code statusLine slot.
   */
  wrapped_status_line?: string;
  /** Snapshot of the Claude Code settings fields we manage, captured at install time. */
  install_backup?: SettingsBackup;
}

/** What we record so `uninstall` can restore the user's original settings. */
export interface SettingsBackup {
  /** Whether spinnerVerbs existed before install. */
  had_spinner_verbs: boolean;
  /** User's original spinnerVerbs (only the non-ThinkCashBack entries). */
  original_spinner_verbs?: string[];
  /** Whether statusLine existed before install. */
  had_status_line: boolean;
  /** User's original statusLine value. */
  original_status_line?: unknown;
  installed_at: string;
}

/** Shape of the on-disk ad cache (~/.thinkcashback/cache.json). */
export interface AdCache {
  ads: Ad[];
  fetched_at: string;
}
