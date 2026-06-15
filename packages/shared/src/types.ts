/**
 * Shared domain types for ThinkCashBack.
 *
 * These mirror the database schema in packages/server/src/db/schema.ts but are
 * transport-friendly (no ORM types) so both the server and the client-cli can
 * depend on them.
 */

export type DeveloperStatus = 'active' | 'suspended' | 'pending';
export type AdvertiserStatus = 'active' | 'suspended';
export type CampaignStatus = 'active' | 'paused' | 'exhausted' | 'archived';
export type EarningsStatus = 'pending' | 'available' | 'paid';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';
export type Platform = 'darwin' | 'linux' | 'win32';

export interface Developer {
  id: string;
  githubId: string;
  email: string;
  stripeConnectId: string | null;
  revShareBps: number;
  status: DeveloperStatus;
  createdAt: string;
}

export interface Device {
  id: string;
  developerId: string;
  machineFingerprint: string;
  platform: Platform;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  headline: string;
  targetUrl: string;
  cpmBidCents: number;
  dailyBudgetCents: number;
  spentTodayCents: number;
  status: CampaignStatus;
  targetingCountries: string[];
  targetingPlatforms: Platform[];
  createdAt: string;
}

/** Public, ad-serving view of a campaign returned to clients. */
export interface AdResponse {
  id: string;
  headline: string;
  url: string;
  trackingId: string;
}

/** Earnings summary returned by GET /api/v1/me/earnings. */
export interface EarningsSummary {
  totalCents: number;
  pendingCents: number;
  paidCents: number;
  daily: Array<{ date: string; impressions: number; grossCents: number; devShareCents: number }>;
}

/** Canonical API envelope used by every endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { page: number; perPage: number; total: number };
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
