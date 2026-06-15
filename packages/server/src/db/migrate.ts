import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv } from '../env.js';

/**
 * Apply all pending Drizzle migrations from ./drizzle to the configured
 * database. Run with `pnpm db:migrate`.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  // eslint-disable-next-line no-console
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
