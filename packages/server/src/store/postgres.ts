import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Platform } from '@thinkcashback/shared';
import { impressionChargeCents, utcDayEnd, utcDayStart } from '../lib/money.js';
import * as schema from '../db/schema.js';
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

/** Drizzle-backed Store for Postgres 16. */
export class PostgresStore implements Store {
  private readonly sqlClient: postgres.Sql;
  private readonly db: PostgresJsDatabase<typeof schema>;

  constructor(databaseUrl: string) {
    this.sqlClient = postgres(databaseUrl, { max: 10 });
    this.db = drizzle(this.sqlClient, { schema, casing: 'snake_case' });
  }

  async createDeveloper(input: CreateDeveloperInput): Promise<DeveloperRecord> {
    const [row] = await this.db
      .insert(schema.developers)
      .values({
        githubId: input.githubId,
        email: input.email,
        apiKeyHash: input.apiKeyHash,
        signingSecretHash: input.signingSecretHash,
        revShareBps: input.revShareBps,
      })
      .returning();
    return mapDeveloper(row);
  }

  async rotateDeveloperCredentials(
    developerId: string,
    apiKeyHash: string,
    signingSecret: string,
  ): Promise<DeveloperRecord | null> {
    const [row] = await this.db
      .update(schema.developers)
      .set({ apiKeyHash, signingSecretHash: signingSecret })
      .where(eq(schema.developers.id, developerId))
      .returning();
    return row ? mapDeveloper(row) : null;
  }

  async getDeveloperById(id: string): Promise<DeveloperRecord | null> {
    const row = await this.db.query.developers.findFirst({ where: eq(schema.developers.id, id) });
    return row ? mapDeveloper(row) : null;
  }

  async getDeveloperByApiKeyHash(hash: string): Promise<DeveloperRecord | null> {
    const row = await this.db.query.developers.findFirst({
      where: eq(schema.developers.apiKeyHash, hash),
    });
    return row ? mapDeveloper(row) : null;
  }

  async getDeveloperByGithubId(githubId: string): Promise<DeveloperRecord | null> {
    const row = await this.db.query.developers.findFirst({
      where: eq(schema.developers.githubId, githubId),
    });
    return row ? mapDeveloper(row) : null;
  }

  async createDevice(input: CreateDeviceInput): Promise<DeviceRecord> {
    const [row] = await this.db
      .insert(schema.devices)
      .values({
        developerId: input.developerId,
        machineFingerprint: input.machineFingerprint,
        devicePubkey: input.devicePubkey ?? null,
        platform: input.platform,
      })
      .returning();
    return mapDevice(row);
  }

  async getDeviceById(id: string): Promise<DeviceRecord | null> {
    const row = await this.db.query.devices.findFirst({ where: eq(schema.devices.id, id) });
    return row ? mapDevice(row) : null;
  }

  async touchDevice(id: string): Promise<void> {
    await this.db
      .update(schema.devices)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.devices.id, id));
  }

  async createAdvertiser(input: { name: string; email: string }): Promise<AdvertiserRecord> {
    const [row] = await this.db
      .insert(schema.advertisers)
      .values({ name: input.name, email: input.email })
      .returning();
    return mapAdvertiser(row);
  }

  async getAdvertiserById(id: string): Promise<AdvertiserRecord | null> {
    const row = await this.db.query.advertisers.findFirst({
      where: eq(schema.advertisers.id, id),
    });
    return row ? mapAdvertiser(row) : null;
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignRecord> {
    const [row] = await this.db
      .insert(schema.campaigns)
      .values({
        advertiserId: input.advertiserId,
        headline: input.headline,
        targetUrl: input.targetUrl,
        cpmBidCents: input.cpmBidCents,
        dailyBudgetCents: input.dailyBudgetCents,
        targetingCountries: input.targetingCountries,
        targetingPlatforms: input.targetingPlatforms,
      })
      .returning();
    return mapCampaign(row);
  }

  async getCampaignById(id: string): Promise<CampaignRecord | null> {
    const row = await this.db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, id) });
    return row ? mapCampaign(row) : null;
  }

  async selectServableCampaigns(query: AdServingQuery): Promise<CampaignRecord[]> {
    // Filter on status + budget in SQL; targeting arrays are matched in SQL too.
    const rows = await this.db
      .select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.status, 'active'),
          // daily_budget_cents is int4; cast to bigint before *1000 so a daily
          // budget above ~$21.4k (int32 max / 1000) doesn't overflow and 500 the
          // whole ad-serving query. spent_today_millicents is already bigint.
          sql`${schema.campaigns.spentTodayMillicents} < ${schema.campaigns.dailyBudgetCents}::bigint * 1000`,
          sql`(cardinality(${schema.campaigns.targetingPlatforms}) = 0 OR ${query.platform} = ANY(${schema.campaigns.targetingPlatforms}))`,
          query.country
            ? sql`(cardinality(${schema.campaigns.targetingCountries}) = 0 OR ${query.country} = ANY(${schema.campaigns.targetingCountries}))`
            : sql`true`,
        ),
      )
      .orderBy(desc(schema.campaigns.cpmBidCents))
      .limit(20);
    return rows.map(mapCampaign);
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return null;
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.impressions)
      .where(
        and(eq(schema.impressions.campaignId, campaignId), eq(schema.impressions.verified, true)),
      );
    return {
      campaignId,
      impressions: count,
      spentCents: campaign.spentTodayCents,
      status: campaign.status,
    };
  }

  async recordImpression(input: RecordImpressionInput): Promise<ImpressionRecord | null> {
    const inserted = await this.db
      .insert(schema.impressions)
      .values({
        deviceId: input.deviceId,
        campaignId: input.campaignId,
        nonce: input.nonce,
        signature: input.signature,
        ipHash: input.ipHash,
        durationMs: input.durationMs,
        verified: input.verified,
      })
      .onConflictDoNothing({
        target: [schema.impressions.deviceId, schema.impressions.nonce],
      })
      .returning();

    if (inserted.length === 0) return null; // duplicate nonce
    const row = inserted[0];
    // Budget debit + earnings accrual happen in billImpression so the sub-cent
    // CPM charge can be billed on the cumulative impression count.
    return mapImpression(row);
  }

  async countRecentImpressions(
    deviceId: string,
    campaignId: string,
    sinceMs: number,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - sinceMs);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.impressions)
      .where(
        and(
          eq(schema.impressions.deviceId, deviceId),
          eq(schema.impressions.campaignId, campaignId),
          gte(schema.impressions.createdAt, cutoff),
        ),
      );
    return count;
  }

  async earningsForDeveloper(developerId: string): Promise<EarningsRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.earningsLedger)
      .where(eq(schema.earningsLedger.developerId, developerId))
      .orderBy(desc(schema.earningsLedger.periodStart));
    return rows.map(mapEarnings);
  }

  async billImpression(input: BillImpressionInput): Promise<void> {
    const periodStart = utcDayStart(input.at);
    const periodEnd = utcDayEnd(input.at);
    const devShareMillicentsDelta = impressionDevShareMillicents(
      input.grossMillicents,
      input.revShareBps,
    );
    await this.db.transaction(async (tx) => {
      // Lock the campaign row first: this serializes concurrent billing for the
      // same campaign so the cumulative-count charge can never race. We read the
      // monotonic billed counter, derive this impression's whole-cent charge,
      // and write the next counter value — all under the lock.
      const [camp] = await tx
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, input.campaignId))
        .for('update')
        .limit(1);

      if (camp) {
        const chargeCents = impressionChargeCents(camp.billedImpressions, input.cpmBidCents);
        const newSpentMillicents = camp.spentTodayMillicents + input.grossMillicents;
        const newBalanceCents = chargeCents > 0 ? camp.balanceCents - chargeCents : camp.balanceCents;
        const exhausted =
          chargeCents > 0 && camp.status === 'active' && newBalanceCents <= 0;
        await tx
          .update(schema.campaigns)
          .set({
            billedImpressions: camp.billedImpressions + 1,
            // Spend accumulated in millicents (source of truth); the cents column
            // is the rounded mirror.
            spentTodayMillicents: newSpentMillicents,
            spentTodayCents: millicentsToWholeCents(newSpentMillicents),
            balanceCents: newBalanceCents,
            status: exhausted ? 'exhausted' : camp.status,
          })
          .where(eq(schema.campaigns.id, input.campaignId));
      }

      // Find the still-open ledger bucket for this UTC day, or create one.
      const existing = await tx
        .select()
        .from(schema.earningsLedger)
        .where(
          and(
            eq(schema.earningsLedger.developerId, input.developerId),
            eq(schema.earningsLedger.campaignId, input.campaignId),
            eq(schema.earningsLedger.periodStart, periodStart),
            eq(schema.earningsLedger.status, 'available'),
          ),
        )
        .for('update')
        .limit(1);

      if (existing.length > 0) {
        const bucket = existing[0];
        const grossMillicents = (bucket.grossMillicents ?? 0) + input.grossMillicents;
        const devShareMillicents = (bucket.devShareMillicents ?? 0) + devShareMillicentsDelta;
        await tx
          .update(schema.earningsLedger)
          .set({
            impressionsCount: bucket.impressionsCount + 1,
            grossMillicents,
            devShareMillicents,
            grossCents: millicentsToWholeCents(grossMillicents),
            devShareCents: millicentsToWholeCents(devShareMillicents),
          })
          .where(eq(schema.earningsLedger.id, bucket.id));
      } else {
        await tx.insert(schema.earningsLedger).values({
          developerId: input.developerId,
          campaignId: input.campaignId,
          periodStart,
          periodEnd,
          impressionsCount: 1,
          grossMillicents: input.grossMillicents,
          devShareMillicents: devShareMillicentsDelta,
          grossCents: millicentsToWholeCents(input.grossMillicents),
          devShareCents: millicentsToWholeCents(devShareMillicentsDelta),
          status: 'available',
        });
      }
    });
  }

  async setDeveloperStripeConnect(
    developerId: string,
    connectId: string,
  ): Promise<DeveloperRecord | null> {
    const [row] = await this.db
      .update(schema.developers)
      .set({ stripeConnectId: connectId })
      .where(eq(schema.developers.id, developerId))
      .returning();
    return row ? mapDeveloper(row) : null;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const [row] = await this.db
      .insert(schema.payments)
      .values({
        advertiserId: input.advertiserId,
        campaignId: input.campaignId,
        amountCents: input.amountCents,
        currency: input.currency,
        stripePaymentIntentId: input.stripePaymentIntentId,
        status: input.status,
      })
      .returning();
    return mapPayment(row);
  }

  async setPaymentIntentId(paymentId: string, stripePaymentIntentId: string): Promise<void> {
    await this.db
      .update(schema.payments)
      .set({ stripePaymentIntentId })
      .where(eq(schema.payments.id, paymentId));
  }

  async getPaymentByIntentId(stripePaymentIntentId: string): Promise<PaymentRecord | null> {
    const row = await this.db.query.payments.findFirst({
      where: eq(schema.payments.stripePaymentIntentId, stripePaymentIntentId),
    });
    return row ? mapPayment(row) : null;
  }

  async markPaymentSucceeded(
    stripePaymentIntentId: string,
  ): Promise<{ payment: PaymentRecord; credited: boolean } | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.stripePaymentIntentId, stripePaymentIntentId))
        .for('update')
        .limit(1);
      if (!row) return null;
      if (row.status === 'succeeded') return { payment: mapPayment(row), credited: false };

      const [updated] = await tx
        .update(schema.payments)
        .set({ status: 'succeeded' })
        .where(eq(schema.payments.id, row.id))
        .returning();

      await tx
        .update(schema.campaigns)
        .set({
          balanceCents: sql`${schema.campaigns.balanceCents} + ${row.amountCents}`,
          status: sql`CASE WHEN ${schema.campaigns.status} = 'exhausted' AND ${schema.campaigns.balanceCents} + ${row.amountCents} > 0 THEN 'active' ELSE ${schema.campaigns.status} END`,
        })
        .where(eq(schema.campaigns.id, row.campaignId));

      return { payment: mapPayment(updated), credited: true };
    });
  }

  async availableEarnings(developerId: string): Promise<EarningsRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.earningsLedger)
      .where(
        and(
          eq(schema.earningsLedger.developerId, developerId),
          eq(schema.earningsLedger.status, 'available'),
        ),
      );
    return rows.map(mapEarnings);
  }

  async payoutsForDeveloper(developerId: string): Promise<PayoutRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.payouts)
      .where(eq(schema.payouts.developerId, developerId))
      .orderBy(desc(schema.payouts.createdAt));
    return rows.map(mapPayout);
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.payouts)
        .values({
          developerId: input.developerId,
          amountCents: input.amountCents,
          status: input.status,
        })
        .returning();
      if (input.earningIds.length > 0) {
        await tx
          .update(schema.earningsLedger)
          .set({ status: 'processing', payoutId: row.id })
          .where(inArray(schema.earningsLedger.id, input.earningIds));
      }
      return mapPayout(row);
    });
  }

  async getPayoutById(id: string): Promise<PayoutRecord | null> {
    const row = await this.db.query.payouts.findFirst({ where: eq(schema.payouts.id, id) });
    return row ? mapPayout(row) : null;
  }

  async getPayoutByTransferId(stripeTransferId: string): Promise<PayoutRecord | null> {
    const row = await this.db.query.payouts.findFirst({
      where: eq(schema.payouts.stripeTransferId, stripeTransferId),
    });
    return row ? mapPayout(row) : null;
  }

  async setPayoutTransfer(payoutId: string, stripeTransferId: string): Promise<void> {
    await this.db
      .update(schema.payouts)
      .set({ stripeTransferId })
      .where(eq(schema.payouts.id, payoutId));
  }

  async markPayoutPaid(payoutId: string): Promise<PayoutRecord | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.payouts)
        .where(eq(schema.payouts.id, payoutId))
        .for('update')
        .limit(1);
      if (!row) return null;
      if (row.status === 'paid') return mapPayout(row);

      const [updated] = await tx
        .update(schema.payouts)
        .set({ status: 'paid' })
        .where(eq(schema.payouts.id, payoutId))
        .returning();
      await tx
        .update(schema.earningsLedger)
        .set({ status: 'paid' })
        .where(eq(schema.earningsLedger.payoutId, payoutId));
      return mapPayout(updated);
    });
  }

  async markPayoutFailed(payoutId: string): Promise<PayoutRecord | null> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.payouts)
        .set({ status: 'failed' })
        .where(eq(schema.payouts.id, payoutId))
        .returning();
      if (!updated) return null;
      await tx
        .update(schema.earningsLedger)
        .set({ status: 'available', payoutId: null })
        .where(eq(schema.earningsLedger.payoutId, payoutId));
      return mapPayout(updated);
    });
  }

  async recordWebhookEvent(eventId: string, type: string): Promise<boolean> {
    const inserted = await this.db
      .insert(schema.processedWebhookEvents)
      .values({ eventId, type })
      .onConflictDoNothing({ target: schema.processedWebhookEvents.eventId })
      .returning();
    return inserted.length > 0;
  }

  async ping(): Promise<boolean> {
    await this.sqlClient`select 1`;
    return true;
  }

  async close(): Promise<void> {
    await this.sqlClient.end({ timeout: 5 });
  }
}

function mapDeveloper(row: schema.DeveloperRow): DeveloperRecord {
  return {
    id: row.id,
    githubId: row.githubId,
    email: row.email,
    stripeConnectId: row.stripeConnectId,
    apiKeyHash: row.apiKeyHash,
    signingSecretHash: row.signingSecretHash,
    revShareBps: row.revShareBps,
    status: row.status as DeveloperRecord['status'],
    createdAt: row.createdAt,
  };
}

function mapDevice(row: schema.DeviceRow): DeviceRecord {
  return {
    id: row.id,
    developerId: row.developerId,
    machineFingerprint: row.machineFingerprint,
    devicePubkey: row.devicePubkey,
    platform: row.platform as Platform,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

function mapAdvertiser(row: schema.AdvertiserRow): AdvertiserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    stripeCustomerId: row.stripeCustomerId,
    status: row.status as AdvertiserRecord['status'],
    createdAt: row.createdAt,
  };
}

function mapCampaign(row: schema.CampaignRow): CampaignRecord {
  return {
    id: row.id,
    advertiserId: row.advertiserId,
    headline: row.headline,
    targetUrl: row.targetUrl,
    cpmBidCents: row.cpmBidCents,
    dailyBudgetCents: row.dailyBudgetCents,
    spentTodayCents: row.spentTodayCents,
    spentTodayMillicents: row.spentTodayMillicents,
    balanceCents: row.balanceCents,
    billedImpressions: row.billedImpressions,
    status: row.status as CampaignRecord['status'],
    targetingCountries: row.targetingCountries,
    targetingPlatforms: row.targetingPlatforms as Platform[],
    createdAt: row.createdAt,
  };
}

function mapImpression(row: schema.ImpressionRow): ImpressionRecord {
  return {
    id: row.id,
    deviceId: row.deviceId,
    campaignId: row.campaignId,
    nonce: row.nonce,
    signature: row.signature,
    ipHash: row.ipHash,
    durationMs: row.durationMs,
    verified: row.verified,
    createdAt: row.createdAt,
  };
}

function mapEarnings(row: schema.EarningsRow): EarningsRecord {
  return {
    id: row.id,
    developerId: row.developerId,
    campaignId: row.campaignId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    impressionsCount: row.impressionsCount,
    grossMillicents: row.grossMillicents,
    devShareMillicents: row.devShareMillicents,
    grossCents: row.grossCents,
    devShareCents: row.devShareCents,
    status: row.status as EarningsRecord['status'],
    payoutId: row.payoutId,
  };
}

function mapPayment(row: schema.PaymentRow): PaymentRecord {
  return {
    id: row.id,
    advertiserId: row.advertiserId,
    campaignId: row.campaignId,
    amountCents: row.amountCents,
    currency: row.currency,
    stripePaymentIntentId: row.stripePaymentIntentId,
    status: row.status as PaymentRecord['status'],
    createdAt: row.createdAt,
  };
}

function mapPayout(row: schema.PayoutRow): PayoutRecord {
  return {
    id: row.id,
    developerId: row.developerId,
    amountCents: row.amountCents,
    stripeTransferId: row.stripeTransferId,
    status: row.status as PayoutRecord['status'],
    createdAt: row.createdAt,
  };
}
