import type {
  AdvertiserStatus,
  CampaignStatus,
  DeveloperStatus,
  EarningsStatus,
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
  grossCents: number;
  devShareCents: number;
  status: EarningsStatus;
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

  // lifecycle
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
