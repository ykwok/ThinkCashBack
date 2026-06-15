import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Platform } from '@thinkcashback/shared';
import * as schema from '../db/schema.js';
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
          sql`${schema.campaigns.spentTodayCents} < ${schema.campaigns.dailyBudgetCents}`,
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

    if (input.verified) {
      await this.db
        .update(schema.campaigns)
        .set({
          spentTodayCents: sql`${schema.campaigns.spentTodayCents} + (${schema.campaigns.cpmBidCents} / 1000)`,
          status: sql`CASE WHEN ${schema.campaigns.spentTodayCents} + (${schema.campaigns.cpmBidCents} / 1000) >= ${schema.campaigns.dailyBudgetCents} THEN 'exhausted' ELSE ${schema.campaigns.status} END`,
        })
        .where(eq(schema.campaigns.id, input.campaignId));
    }
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
    grossCents: row.grossCents,
    devShareCents: row.devShareCents,
    status: row.status as EarningsRecord['status'],
  };
}
