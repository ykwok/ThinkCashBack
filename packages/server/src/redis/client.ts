import Redis from 'ioredis';

/**
 * Minimal counter/cache interface the app depends on. We expose just the
 * operations the routes need (rate limiting + realtime counters) so the
 * in-memory fallback stays tiny and the Redis implementation is a thin shim.
 */
export interface CounterStore {
  /** Increment a key and return the new value; sets TTL on first increment. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  close(): Promise<void>;
}

class RedisCounterStore implements CounterStore {
  constructor(private readonly client: Redis) {}

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) await this.client.expire(key, ttlSeconds);
    return value;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

/** Process-local fallback used when REDIS_URL is unset (dev / tests). */
class MemoryCounterStore implements CounterStore {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private sweep(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    this.sweep(key);
    const entry = this.store.get(key);
    if (!entry) {
      this.store.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }

  async get(key: string): Promise<string | null> {
    this.sweep(key);
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

export function createCounterStore(redisUrl?: string): CounterStore {
  if (redisUrl && redisUrl.length > 0) {
    const client = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
    return new RedisCounterStore(client);
  }
  return new MemoryCounterStore();
}
