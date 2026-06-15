import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { generateToken, sha256 } from '@thinkcashback/shared';
import { loadEnv } from '../env.js';
import * as schema from './schema.js';

/**
 * Seed the database with a minimal working dataset:
 *   - 1 developer (with printed API key + signing secret)
 *   - 1 advertiser
 *   - 2 campaigns (different platforms / bids)
 *
 * Idempotency is intentionally NOT guaranteed — run against a fresh DB.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed');

  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });

  const apiKey = generateToken(24);
  const signingSecret = generateToken(24);

  const [developer] = await db
    .insert(schema.developers)
    .values({
      githubId: 'seed-octocat',
      email: 'octocat@example.com',
      apiKeyHash: sha256(apiKey),
      signingSecretHash: signingSecret,
      revShareBps: env.DEFAULT_REV_SHARE_BPS,
    })
    .returning();

  const [advertiser] = await db
    .insert(schema.advertisers)
    .values({ name: 'Acme Inc', email: 'ads@acme.example.com' })
    .returning();

  const [campaignA, campaignB] = await db
    .insert(schema.campaigns)
    .values([
      {
        advertiserId: advertiser.id,
        headline: 'Try Acme Cloud — 3 months free',
        targetUrl: 'https://acme.example.com/cloud',
        cpmBidCents: 150,
        dailyBudgetCents: 50_000,
        targetingCountries: ['US', 'CA'],
        targetingPlatforms: ['darwin', 'linux'],
      },
      {
        advertiserId: advertiser.id,
        headline: 'Acme CLI Pro for power users',
        targetUrl: 'https://acme.example.com/cli',
        cpmBidCents: 100,
        dailyBudgetCents: 30_000,
        targetingCountries: [],
        targetingPlatforms: [],
      },
    ])
    .returning();

  // eslint-disable-next-line no-console
  console.log('Seed complete:');
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        developerId: developer.id,
        apiKey,
        signingSecret,
        advertiserId: advertiser.id,
        campaigns: [campaignA.id, campaignB.id],
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
