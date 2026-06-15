/**
 * Shared types for the ThinkCashBack CLI client.
 * API contract mirrors the backend (PRO-345).
 */

/** A single ad returned by GET /api/v1/ad. */
export interface Ad {
  id: string;
  headline: string;
  url: string;
  tracking_id: string;
}

/** Response from POST /api/v1/devices. */
export interface DeviceRegistration {
  device_id: string;
  api_key: string;
  signing_secret: string;
}

/** Payload sent to POST /api/v1/impressions. */
export interface ImpressionPayload {
  campaign_id: string;
  device_id: string;
  nonce: string;
  signature: string;
  duration_ms: number;
}

/** Response from GET /api/v1/me/earnings. */
export interface Earnings {
  currency: string;
  today_impressions: number;
  today_earnings: number;
  total_impressions: number;
  total_earnings: number;
  pending_payout: number;
}

/** Locally stored credentials and settings (~/.thinkcashback/config.json). */
export interface LocalConfig {
  api_base?: string;
  jwt?: string;
  device_id?: string;
  api_key?: string;
  signing_secret?: string;
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
