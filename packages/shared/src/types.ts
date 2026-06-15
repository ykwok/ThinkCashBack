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
export type EarningsStatus = 'pending' | 'available' | 'processing' | 'paid';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';
/** Advertiser top-up payment lifecycle (mirrors Stripe PaymentIntent). */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed';
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
  /** Funded budget remaining (credited by advertiser top-ups, debited per impression). */
  balanceCents: number;
  status: CampaignStatus;
  targetingCountries: string[];
  targetingPlatforms: Platform[];
  createdAt: string;
}

/** Advertiser top-up returned by POST /api/v1/advertisers/:id/topup. */
export interface Payment {
  id: string;
  advertiserId: string;
  campaignId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  /** Returned only when a PaymentIntent is created, so the client can confirm payment. */
  clientSecret?: string | null;
  createdAt: string;
}

/** Developer payout returned by POST /api/v1/me/payouts. */
export interface Payout {
  id: string;
  developerId: string;
  amountCents: number;
  status: PayoutStatus;
  stripeTransferId: string | null;
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
