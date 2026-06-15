import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { createCounterStore } from './redis/client.js';
import { createStore } from './store/index.js';

const env = loadEnv();
const store = createStore(env.DATABASE_URL);
const counters = createCounterStore(env.REDIS_URL);
const app = createApp({ env, store, counters });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  const backend = env.DATABASE_URL ? 'postgres' : 'in-memory';
  // eslint-disable-next-line no-console
  console.log(`ThinkCashBack server listening on :${info.port} (store=${backend})`);
});

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await Promise.allSettled([store.close(), counters.close()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
