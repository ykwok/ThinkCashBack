import { randomUUID } from 'node:crypto';
import type {
  AdServingQuery,
  AdvertiserRecord,
  CampaignRecord,
  CampaignStats,
  CreateCampaignInput,
  CreateDeveloperInput,
  CreateDeviceInput,
  DeveloperRecord,
  DeviceRecord,
  EarningsRecord,
  ImpressionRecord,
  RecordImpressionInput,
  Store,
} from './types.js';

/**
 * In-memory Store implementation.
 *
 * Used by the test suite and as a zero-dependency fallback for `pnpm dev`
 * before Postgres is wired up. It is intentionally not concurrency-safe across
 * processes — that is the Postgres store's job.
 */
export class MemoryStore implements Store {
  private developers = new Map<string, DeveloperRecord>();
  private devices = new Map<string, DeviceRecord>();
  private advertisers = new Map<string, AdvertiserRecord>();
  private campaigns = new Map<string, CampaignRecord>();
  private impressions: ImpressionRecord[] = [];
  private earnings: EarningsRecord[] = [];
  /** (deviceId|nonce) -> true, the dedup backstop mirroring the unique index. */
  private nonceSeen = new Set<string>();

  async createDeveloper(input: CreateDeveloperInput): Promise<DeveloperRecord> {
    const record: DeveloperRecord = {
      id: randomUUID(),
      githubId: input.githubId,
      email: input.email,
      stripeConnectId: null,
      apiKeyHash: input.apiKeyHash,
      signingSecretHash: input.signingSecretHash,
      revShareBps: input.revShareBps,
      status: 'active',
      createdAt: new Date(),
    };
    this.developers.set(record.id, record);
    return record;
  }

  async rotateDeveloperCredentials(
    developerId: string,
    apiKeyHash: string,
    signingSecret: string,
  ): Promise<DeveloperRecord | null> {
    const dev = this.developers.get(developerId);
    if (!dev) return null;
    dev.apiKeyHash = apiKeyHash;
    dev.signingSecretHash = signingSecret;
    return dev;
  }

  async getDeveloperById(id: string): Promise<DeveloperRecord | null> {
    return this.developers.get(id) ?? null;
  }

  async getDeveloperByApiKeyHash(hash: string): Promise<DeveloperRecord | null> {
    for (const dev of this.developers.values()) {
      if (dev.apiKeyHash === hash) return dev;
    }
    return null;
  }

  async getDeveloperByGithubId(githubId: string): Promise<DeveloperRecord | null> {
    for (const dev of this.developers.values()) {
      if (dev.githubId === githubId) return dev;
    }
    return null;
  }

  async createDevice(input: CreateDeviceInput): Promise<DeviceRecord> {
    const record: DeviceRecord = {
      id: randomUUID(),
      developerId: input.developerId,
      machineFingerprint: input.machineFingerprint,
      devicePubkey: input.devicePubkey ?? null,
      platform: input.platform,
      lastSeenAt: null,
      createdAt: new Date(),
    };
    this.devices.set(record.id, record);
    return record;
  }

  async getDeviceById(id: string): Promise<DeviceRecord | null> {
    return this.devices.get(id) ?? null;
  }

  async touchDevice(id: string): Promise<void> {
    const device = this.devices.get(id);
    if (device) device.lastSeenAt = new Date();
  }

  async createAdvertiser(input: { name: string; email: string }): Promise<AdvertiserRecord> {
    const record: AdvertiserRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      stripeCustomerId: null,
      status: 'active',
      createdAt: new Date(),
    };
    this.advertisers.set(record.id, record);
    return record;
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignRecord> {
    const record: CampaignRecord = {
      id: randomUUID(),
      advertiserId: input.advertiserId,
      headline: input.headline,
      targetUrl: input.targetUrl,
      cpmBidCents: input.cpmBidCents,
      dailyBudgetCents: input.dailyBudgetCents,
      spentTodayCents: 0,
      status: 'active',
      targetingCountries: input.targetingCountries,
      targetingPlatforms: input.targetingPlatforms,
      createdAt: new Date(),
    };
    this.campaigns.set(record.id, record);
    return record;
  }

  async getCampaignById(id: string): Promise<CampaignRecord | null> {
    return this.campaigns.get(id) ?? null;
  }

  async selectServableCampaigns(query: AdServingQuery): Promise<CampaignRecord[]> {
    return [...this.campaigns.values()]
      .filter((c) => c.status === 'active')
      .filter((c) => c.spentTodayCents < c.dailyBudgetCents)
      .filter(
        (c) => c.targetingPlatforms.length === 0 || c.targetingPlatforms.includes(query.platform),
      )
      .filter(
        (c) =>
          !query.country ||
          c.targetingCountries.length === 0 ||
          c.targetingCountries.includes(query.country),
      )
      .sort((a, b) => b.cpmBidCents - a.cpmBidCents);
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;
    const impressions = this.impressions.filter(
      (i) => i.campaignId === campaignId && i.verified,
    ).length;
    return {
      campaignId,
      impressions,
      spentCents: campaign.spentTodayCents,
      status: campaign.status,
    };
  }

  async recordImpression(input: RecordImpressionInput): Promise<ImpressionRecord | null> {
    const key = `${input.deviceId}|${input.nonce}`;
    if (this.nonceSeen.has(key)) return null;
    this.nonceSeen.add(key);
    const record: ImpressionRecord = {
      id: randomUUID(),
      deviceId: input.deviceId,
      campaignId: input.campaignId,
      nonce: input.nonce,
      signature: input.signature,
      ipHash: input.ipHash,
      durationMs: input.durationMs,
      verified: input.verified,
      createdAt: new Date(),
    };
    this.impressions.push(record);

    if (input.verified) {
      const campaign = this.campaigns.get(input.campaignId);
      if (campaign) {
        // CPM is per 1000 impressions; one impression spends bid/1000 cents.
        campaign.spentTodayCents += campaign.cpmBidCents / 1000;
        if (campaign.spentTodayCents >= campaign.dailyBudgetCents) {
          campaign.status = 'exhausted';
        }
      }
    }
    return record;
  }

  async countRecentImpressions(
    deviceId: string,
    campaignId: string,
    sinceMs: number,
  ): Promise<number> {
    const cutoff = Date.now() - sinceMs;
    return this.impressions.filter(
      (i) =>
        i.deviceId === deviceId && i.campaignId === campaignId && i.createdAt.getTime() >= cutoff,
    ).length;
  }

  async earningsForDeveloper(developerId: string): Promise<EarningsRecord[]> {
    return this.earnings.filter((e) => e.developerId === developerId);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // nothing to release
  }

  // --- test/seed helpers (not part of the Store contract) ---

  /** Directly seed an earnings ledger row (used by tests and the seed script). */
  seedEarnings(record: EarningsRecord): void {
    this.earnings.push(record);
  }
}
