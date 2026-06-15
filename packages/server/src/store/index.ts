import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';
import type { Store } from './types.js';

export * from './types.js';
export { MemoryStore } from './memory.js';
export { PostgresStore } from './postgres.js';

/**
 * Pick a store based on configuration. When DATABASE_URL is set we use
 * Postgres; otherwise we fall back to the in-memory store so the server (and
 * the test suite) can boot with zero infrastructure.
 */
export function createStore(databaseUrl?: string): Store {
  if (databaseUrl && databaseUrl.length > 0) {
    return new PostgresStore(databaseUrl);
  }
  return new MemoryStore();
}
