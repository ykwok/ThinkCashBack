import { randomUUID } from 'node:crypto';
import { impressionChargeCents, utcDayEnd, utcDayStart } from '../lib/money.js';
import { impressionDevShareMillicents, millicentsToWholeCents } from '../lib/earnings.js';
import type {
  AdServingQuery,
  AdvertiserRecord,
  BillImpressionInput,
  CampaignRecord,
  CampaignStats,
  CreateCampaignInput,
  CreateDeveloperInput,
  CreateDeviceInput,
  CreatePaymentInput,
  CreatePayoutInput,
  DeveloperRecord,
  DeviceRecord,
  EarningsRecord,
  ImpressionRecord,
  PaymentRecord,
  PayoutRecord,
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
  private payments = new Map<string, PaymentRecord>();
  private payouts = new Map<string, PayoutRecord>();
  private webhookEvents = new Set<string>();
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

  async getAdvertiserById(id: string): Promise<AdvertiserRecord | null> {
    return this.advertisers.get(id) ?? null;
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
      spentTodayMillicents: 0,
      balanceCents: 0,
      billedImpressions: 0,
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
      .filter((c) => c.spentTodayMillicents < c.dailyBudgetCents * 1000)
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
    // Budget debit + earnings accrual are handled by billImpression so they
    // can be charged on the cumulative impression count (sub-cent CPM math).
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

  async billImpression(input: BillImpressionInput): Promise<void> {
    const campaign = this.campaigns.get(input.campaignId);
    if (campaign) {
      // Whole-cent budget debit is derived from the monotonic billed counter so
      // the sub-cent CPM charge stays exact (single-process, so no lock needed).
      const chargeCents = impressionChargeCents(campaign.billedImpressions, input.cpmBidCents);
      campaign.billedImpressions += 1;
      // Precise spend accumulator in millicents (source of truth), with the
      // whole-cent column kept as the rounded mirror.
      campaign.spentTodayMillicents += input.grossMillicents;
      campaign.spentTodayCents = millicentsToWholeCents(campaign.spentTodayMillicents);
      if (chargeCents > 0) {
        campaign.balanceCents -= chargeCents;
        if (campaign.status === 'active' && campaign.balanceCents <= 0) {
          campaign.status = 'exhausted';
        }
      }
    }

    // Accrue into the developer's still-open ledger bucket for the UTC day.
    // Earnings are kept in millicents so a sub-cent per-impression share never
    // truncates to zero; the cents columns are the rounded display mirror.
    const periodStart = utcDayStart(input.at);
    let bucket = this.earnings.find(
      (e) =>
        e.developerId === input.developerId &&
        e.campaignId === input.campaignId &&
        e.periodStart.getTime() === periodStart.getTime() &&
        e.status === 'available',
    );
    if (!bucket) {
      bucket = {
        id: randomUUID(),
        developerId: input.developerId,
        campaignId: input.campaignId,
        periodStart,
        periodEnd: utcDayEnd(input.at),
        impressionsCount: 0,
        grossMillicents: 0,
        devShareMillicents: 0,
        grossCents: 0,
        devShareCents: 0,
        status: 'available',
        payoutId: null,
      };
      this.earnings.push(bucket);
    }
    bucket.impressionsCount += 1;
    bucket.grossMillicents = (bucket.grossMillicents ?? 0) + input.grossMillicents;
    bucket.devShareMillicents =
      (bucket.devShareMillicents ?? 0) +
      impressionDevShareMillicents(input.grossMillicents, input.revShareBps);
    bucket.grossCents = millicentsToWholeCents(bucket.grossMillicents);
    bucket.devShareCents = millicentsToWholeCents(bucket.devShareMillicents);
  }

  async setDeveloperStripeConnect(
    developerId: string,
    connectId: string,
  ): Promise<DeveloperRecord | null> {
    const dev = this.developers.get(developerId);
    if (!dev) return null;
    dev.stripeConnectId = connectId;
    return dev;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const record: PaymentRecord = {
      id: randomUUID(),
      advertiserId: input.advertiserId,
      campaignId: input.campaignId,
      amountCents: input.amountCents,
      currency: input.currency,
      stripePaymentIntentId: input.stripePaymentIntentId,
      status: input.status,
      createdAt: new Date(),
    };
    this.payments.set(record.id, record);
    return record;
  }

  async setPaymentIntentId(paymentId: string, stripePaymentIntentId: string): Promise<void> {
    const payment = this.payments.get(paymentId);
    if (payment) payment.stripePaymentIntentId = stripePaymentIntentId;
  }

  async getPaymentByIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    for (const p of this.payments.values()) {
      if (p.stripePaymentIntentId === stripePaymentIntentId) return p;
    }
    return null;
  }

  async markPaymentSucceeded(
    stripePaymentIntentId: string,
  ): Promise<{ payment: PaymentRecord; credited: boolean } | null> {
    const payment = await this.getPaymentByIntentId(stripePaymentIntentId);
    if (!payment) return null;
    if (payment.status === 'succeeded') return { payment, credited: false };
    payment.status = 'succeeded';
    const campaign = this.campaigns.get(payment.campaignId);
    if (campaign) {
      campaign.balanceCents += payment.amountCents;
      // Re-open a campaign that was paused only by an exhausted budget.
      if (campaign.status === 'exhausted' && campaign.balanceCents > 0) {
        campaign.status = 'active';
      }
    }
    return { payment, credited: true };
  }

  async availableEarnings(developerId: string): Promise<EarningsRecord[]> {
    return this.earnings.filter((e) => e.developerId === developerId && e.status === 'available');
  }

  async payoutsForDeveloper(developerId: string): Promise<PayoutRecord[]> {
    return [...this.payouts.values()]
      .filter((p) => p.developerId === developerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutRecord> {
    const record: PayoutRecord = {
      id: randomUUID(),
      developerId: input.developerId,
      amountCents: input.amountCents,
      stripeTransferId: null,
      status: input.status,
      createdAt: new Date(),
    };
    this.payouts.set(record.id, record);
    for (const e of this.earnings) {
      if (input.earningIds.includes(e.id)) {
        e.status = 'processing';
        e.payoutId = record.id;
      }
    }
    return record;
  }

  async getPayoutById(id: string): Promise<PayoutRecord | null> {
    return this.payouts.get(id) ?? null;
  }

  async getPayoutByTransferId(stripeTransferId: string): Promise<PayoutRecord | null> {
    for (const p of this.payouts.values()) {
      if (p.stripeTransferId === stripeTransferId) return p;
    }
    return null;
  }

  async setPayoutTransfer(payoutId: string, stripeTransferId: string): Promise<void> {
    const payout = this.payouts.get(payoutId);
    if (payout) payout.stripeTransferId = stripeTransferId;
  }

  async markPayoutPaid(payoutId: string): Promise<PayoutRecord | null> {
    const payout = this.payouts.get(payoutId);
    if (!payout) return null;
    if (payout.status === 'paid') return payout;
    payout.status = 'paid';
    for (const e of this.earnings) {
      if (e.payoutId === payoutId) e.status = 'paid';
    }
    return payout;
  }

  async markPayoutFailed(payoutId: string): Promise<PayoutRecord | null> {
    const payout = this.payouts.get(payoutId);
    if (!payout) return null;
    payout.status = 'failed';
    for (const e of this.earnings) {
      if (e.payoutId === payoutId) {
        e.status = 'available';
        e.payoutId = null;
      }
    }
    return payout;
  }

  async recordWebhookEvent(eventId: string): Promise<boolean> {
    if (this.webhookEvents.has(eventId)) return false;
    this.webhookEvents.add(eventId);
    return true;
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
