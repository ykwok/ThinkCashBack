import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * ThinkCashBack core schema (Postgres 16).
 *
 * Conventions (per BackendAgent standards):
 *   - every table has created_at; mutable tables also have updated_at
 *   - every foreign key column is indexed
 *   - monetary values are stored as integer cents
 *   - rev share is stored in basis points (bps): 8000 = 80%
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

const mutableTimestamps = {
  ...timestamps,
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const developers = pgTable(
  'developers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: text('github_id').notNull(),
    email: text('email').notNull(),
    stripeConnectId: text('stripe_connect_id'),
    apiKeyHash: text('api_key_hash').notNull(),
    signingSecretHash: text('signing_secret_hash').notNull(),
    revShareBps: integer('rev_share_bps').notNull().default(8000),
    status: text('status').notNull().default('active'),
    ...mutableTimestamps,
  },
  (t) => ({
    githubIdUq: uniqueIndex('developers_github_id_uq').on(t.githubId),
    emailUq: uniqueIndex('developers_email_uq').on(t.email),
    apiKeyHashUq: uniqueIndex('developers_api_key_hash_uq').on(t.apiKeyHash),
  }),
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    machineFingerprint: text('machine_fingerprint').notNull(),
    devicePubkey: text('device_pubkey'),
    platform: text('platform').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    developerIdx: index('devices_developer_id_idx').on(t.developerId),
    fingerprintUq: uniqueIndex('devices_developer_fingerprint_uq').on(
      t.developerId,
      t.machineFingerprint,
    ),
  }),
);

export const advertisers = pgTable(
  'advertisers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    status: text('status').notNull().default('active'),
    ...mutableTimestamps,
  },
  (t) => ({
    emailUq: uniqueIndex('advertisers_email_uq').on(t.email),
  }),
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    advertiserId: uuid('advertiser_id')
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    headline: text('headline').notNull(),
    targetUrl: text('target_url').notNull(),
    cpmBidCents: integer('cpm_bid_cents').notNull(),
    dailyBudgetCents: integer('daily_budget_cents').notNull(),
    spentTodayCents: integer('spent_today_cents').notNull().default(0),
    // Precise spend accumulator in millicents (1 cent = 1000 millicents). A
    // single impression spends cpm_bid_cents/1000 cents — a sub-cent amount —
    // so spent_today_cents alone truncates to zero. This column is the source
    // of truth for budget exhaustion; spent_today_cents is the rounded mirror.
    spentTodayMillicents: bigint('spent_today_millicents', { mode: 'number' })
      .notNull()
      .default(0),
    // Funded budget remaining: advertiser top-ups credit it, impressions debit it.
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(0),
    // Monotonic count of impressions already billed. The whole-cent budget debit
    // for impression N is derived from this counter under a row lock, so the
    // sub-cent CPM charge stays exact and race-free (does not re-scan the
    // impressions table). Never reset.
    billedImpressions: integer('billed_impressions').notNull().default(0),
    status: text('status').notNull().default('active'),
    targetingCountries: text('targeting_countries')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    targetingPlatforms: text('targeting_platforms')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...mutableTimestamps,
  },
  (t) => ({
    advertiserIdx: index('campaigns_advertiser_id_idx').on(t.advertiserId),
    // Hot path: ad serving filters on status and orders by bid.
    servingIdx: index('campaigns_status_bid_idx').on(t.status, t.cpmBidCents),
  }),
);

/**
 * Impressions are append-only and high volume. In production this table is
 * partitioned by month (created_at) — see drizzle/0001_impressions_partition.sql.
 * The nonce uniqueness index is the server-side dedup backstop.
 */
export const impressions = pgTable(
  'impressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull(),
    signature: text('signature').notNull(),
    ipHash: text('ip_hash'),
    durationMs: integer('duration_ms').notNull().default(0),
    verified: boolean('verified').notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    deviceIdx: index('impressions_device_id_idx').on(t.deviceId),
    campaignIdx: index('impressions_campaign_id_idx').on(t.campaignId),
    nonceUq: uniqueIndex('impressions_device_nonce_uq').on(t.deviceId, t.nonce),
    createdAtIdx: index('impressions_created_at_idx').on(t.createdAt),
  }),
);

export const earningsLedger = pgTable(
  'earnings_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    impressionsCount: integer('impressions_count').notNull().default(0),
    // Precise accumulators in millicents (1 cent = 1000 millicents). Per-cent
    // columns are kept as rounded mirrors for display; the millicent columns are
    // the source of truth so sub-cent per-impression earnings never truncate.
    grossMillicents: bigint('gross_millicents', { mode: 'number' }).notNull().default(0),
    devShareMillicents: bigint('dev_share_millicents', { mode: 'number' }).notNull().default(0),
    grossCents: bigint('gross_cents', { mode: 'number' }).notNull().default(0),
    devShareCents: bigint('dev_share_cents', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('pending'),
    // Set when the row is rolled into a payout (status -> processing/paid).
    payoutId: uuid('payout_id').references(() => payouts.id, { onDelete: 'set null' }),
    ...mutableTimestamps,
  },
  (t) => ({
    developerIdx: index('earnings_developer_id_idx').on(t.developerId),
    campaignIdx: index('earnings_campaign_id_idx').on(t.campaignId),
    periodIdx: index('earnings_period_idx').on(t.developerId, t.periodStart),
    payoutIdx: index('earnings_payout_id_idx').on(t.payoutId),
  }),
);

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    stripeTransferId: text('stripe_transfer_id'),
    status: text('status').notNull().default('pending'),
    ...mutableTimestamps,
  },
  (t) => ({
    developerIdx: index('payouts_developer_id_idx').on(t.developerId),
  }),
);

/**
 * Advertiser top-ups. One row per Stripe PaymentIntent; on
 * `payment_intent.succeeded` the campaign budget is credited. The unique index
 * on the PaymentIntent id is the webhook idempotency backstop.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    advertiserId: uuid('advertiser_id')
      .notNull()
      .references(() => advertisers.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('usd'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    status: text('status').notNull().default('pending'),
    ...mutableTimestamps,
  },
  (t) => ({
    advertiserIdx: index('payments_advertiser_id_idx').on(t.advertiserId),
    campaignIdx: index('payments_campaign_id_idx').on(t.campaignId),
    paymentIntentUq: uniqueIndex('payments_payment_intent_uq').on(t.stripePaymentIntentId),
  }),
);

/**
 * Processed Stripe webhook event ids. Inserting before handling gives us
 * exactly-once processing: a duplicate delivery hits the primary key and is
 * skipped.
 */
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  ...timestamps,
});

export type DeveloperRow = typeof developers.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type AdvertiserRow = typeof advertisers.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type ImpressionRow = typeof impressions.$inferSelect;
export type EarningsRow = typeof earningsLedger.$inferSelect;
export type PayoutRow = typeof payouts.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type ProcessedWebhookEventRow = typeof processedWebhookEvents.$inferSelect;
