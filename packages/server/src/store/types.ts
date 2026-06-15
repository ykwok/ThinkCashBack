import type {
  AdvertiserStatus,
  CampaignStatus,
  DeveloperStatus,
  EarningsStatus,
  PaymentStatus,
  PayoutStatus,
  Platform,
} from '@thinkcashback/shared';

/**
 * Persistence-agnostic record shapes used by the route handlers. Both the
 * Postgres store and the in-memory store return these so handlers never touch
 * the ORM directly — which is what lets the test suite run with no database.
 */

export interface DeveloperRecord {
  id: string;
  githubId: string;
  email: string;
  stripeConnectId: string | null;
  apiKeyHash: string;
  signingSecretHash: string;
  revShareBps: number;
  status: DeveloperStatus;
  createdAt: Date;
}

export interface DeviceRecord {
  id: string;
  developerId: string;
  machineFingerprint: string;
  devicePubkey: string | null;
  platform: Platform;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface AdvertiserRecord {
  id: string;
  name: string;
  email: string;
  stripeCustomerId: string | null;
  status: AdvertiserStatus;
  createdAt: Date;
}

export interface CampaignRecord {
  id: string;
  advertiserId: string;
  headline: string;
  targetUrl: string;
  cpmBidCents: number;
  dailyBudgetCents: number;
  spentTodayCents: number;
  /** Precise spend accumulator in millicents; source of truth for budget. */
  spentTodayMillicents: number;
  balanceCents: number;
  status: CampaignStatus;
  targetingCountries: string[];
  targetingPlatforms: Platform[];
  createdAt: Date;
}

export interface ImpressionRecord {
  id: string;
  deviceId: string;
  campaignId: string;
  nonce: string;
  signature: string;
  ipHash: string | null;
  durationMs: number;
  verified: boolean;
  createdAt: Date;
}

export interface EarningsRecord {
  id: string;
  developerId: string;
  campaignId: string;
  periodStart: Date;
  periodEnd: Date;
  impressionsCount: number;
  /**
   * Precise accumulators in millicents (1 cent = 1000 millicents). Optional so
   * legacy/seeded rows that only carry the rounded cents columns still type;
   * summarizeEarnings falls back to `*Cents * 1000` when these are absent.
   */
  grossMillicents?: number;
  devShareMillicents?: number;
  grossCents: number;
  devShareCents: number;
  status: EarningsStatus;
  payoutId?: string | null;
}

export interface PaymentRecord {
  id: string;
  advertiserId: string;
  campaignId: string;
  amountCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  status: PaymentStatus;
  createdAt: Date;
}

export interface PayoutRecord {
  id: string;
  developerId: string;
  amountCents: number;
  stripeTransferId: string | null;
  status: PayoutStatus;
  createdAt: Date;
}

export interface AdServingQuery {
  platform: Platform;
  country?: string;
}

export interface CreateDeveloperInput {
  githubId: string;
  email: string;
  /** sha256(apiKey) — bearer tokens are verified by hashing the presented key. */
  apiKeyHash: string;
  /**
   * The HMAC signing key for impression verification. Unlike the API key, the
   * server must hold the actual key material to recompute the HMAC, so this is
   * the symmetric secret itself (column name follows the data model spec).
   * In production this column must be encrypted at rest / held in a KMS.
   */
  signingSecretHash: string;
  revShareBps: number;
}

export interface CreateDeviceInput {
  developerId: string;
  machineFingerprint: string;
  devicePubkey?: string | null;
  platform: Platform;
}

export interface CreateCampaignInput {
  advertiserId: string;
  headline: string;
  targetUrl: string;
  cpmBidCents: number;
  dailyBudgetCents: number;
  targetingCountries: string[];
  targetingPlatforms: Platform[];
}

export interface RecordImpressionInput {
  deviceId: string;
  campaignId: string;
  nonce: string;
  signature: string;
  ipHash: string | null;
  durationMs: number;
  verified: boolean;
}

export interface CreatePaymentInput {
  advertiserId: string;
  campaignId: string;
  amountCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  status: PaymentStatus;
}

/**
 * One verified impression's billing effect: debit the campaign budget by
 * `chargeCents` and accrue the developer's revenue share into the ledger.
 */
export interface BillImpressionInput {
  campaignId: string;
  developerId: string;
  /**
   * Precise gross spend for this single impression, in millicents (= cpm_bid_cents).
   * Source of truth for the earnings ledger so a sub-cent share never truncates.
   */
  grossMillicents: number;
  /**
   * Whole-cent budget delta for this impression, billed on the cumulative
   * impression count so sub-cent CPM charges debit the funded balance exactly.
   */
  chargeCents: number;
  revShareBps: number;
  at: Date;
}

export interface CreatePayoutInput {
  developerId: string;
  amountCents: number;
  /** Ledger rows rolled into this payout; marked processing + linked. */
  earningIds: string[];
  status: PayoutStatus;
}

export interface CampaignStats {
  campaignId: string;
  impressions: number;
  spentCents: number;
  status: CampaignStatus;
}

/**
 * The contract every storage backend implements. Keep it small and intention
 * revealing — one method per use case the routes actually need.
 */
export interface Store {
  // developers
  createDeveloper(input: CreateDeveloperInput): Promise<DeveloperRecord>;
  /** Replace a developer's api key hash + signing secret (credential rotation). */
  rotateDeveloperCredentials(
    developerId: string,
    apiKeyHash: string,
    signingSecret: string,
  ): Promise<DeveloperRecord | null>;
  getDeveloperById(id: string): Promise<DeveloperRecord | null>;
  getDeveloperByApiKeyHash(hash: string): Promise<DeveloperRecord | null>;
  getDeveloperByGithubId(githubId: string): Promise<DeveloperRecord | null>;

  // devices
  createDevice(input: CreateDeviceInput): Promise<DeviceRecord>;
  getDeviceById(id: string): Promise<DeviceRecord | null>;
  touchDevice(id: string): Promise<void>;

  // advertisers
  createAdvertiser(input: { name: string; email: string }): Promise<AdvertiserRecord>;
  getAdvertiserById(id: string): Promise<AdvertiserRecord | null>;

  // campaigns
  createCampaign(input: CreateCampaignInput): Promise<CampaignRecord>;
  getCampaignById(id: string): Promise<CampaignRecord | null>;
  /** Active campaigns matching the query, ordered by bid desc (highest first). */
  selectServableCampaigns(query: AdServingQuery): Promise<CampaignRecord[]>;
  getCampaignStats(campaignId: string): Promise<CampaignStats | null>;

  // impressions
  /** Insert an impression; returns null if (device_id, nonce) already exists. */
  recordImpression(input: RecordImpressionInput): Promise<ImpressionRecord | null>;
  countRecentImpressions(deviceId: string, campaignId: string, sinceMs: number): Promise<number>;

  // earnings
  earningsForDeveloper(developerId: string): Promise<EarningsRecord[]>;
  /** Verified-impression billing: debit campaign budget + accrue dev share. */
  billImpression(input: BillImpressionInput): Promise<void>;

  // developer payout identity
  setDeveloperStripeConnect(developerId: string, connectId: string): Promise<DeveloperRecord | null>;

  // advertiser billing (top-ups)
  createPayment(input: CreatePaymentInput): Promise<PaymentRecord>;
  setPaymentIntentId(paymentId: string, stripePaymentIntentId: string): Promise<void>;
  getPaymentByIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null>;
  /**
   * Mark a top-up succeeded and credit the campaign budget. Idempotent: returns
   * `credited: false` if the payment was already succeeded.
   */
  markPaymentSucceeded(
    stripePaymentIntentId: string,
  ): Promise<{ payment: PaymentRecord; credited: boolean } | null>;

  // developer payouts
  availableEarnings(developerId: string): Promise<EarningsRecord[]>;
  payoutsForDeveloper(developerId: string): Promise<PayoutRecord[]>;
  createPayout(input: CreatePayoutInput): Promise<PayoutRecord>;
  getPayoutById(id: string): Promise<PayoutRecord | null>;
  getPayoutByTransferId(stripeTransferId: string): Promise<PayoutRecord | null>;
  setPayoutTransfer(payoutId: string, stripeTransferId: string): Promise<void>;
  /** Finalize a payout: payout -> paid and its linked ledger rows -> paid. */
  markPayoutPaid(payoutId: string): Promise<PayoutRecord | null>;
  /** Reverse a failed payout: payout -> failed, ledger rows back to available. */
  markPayoutFailed(payoutId: string): Promise<PayoutRecord | null>;

  // webhook idempotency
  /** Record a Stripe event id; returns true the first time, false if a replay. */
  recordWebhookEvent(eventId: string, type: string): Promise<boolean>;

  // lifecycle
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
