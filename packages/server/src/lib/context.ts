import type { Env } from '../env.js';
import type { CounterStore } from '../redis/client.js';
import type { StripeGateway } from './stripe.js';
import type { DeveloperRecord, Store } from '../store/index.js';

/**
 * Dependencies injected into every request via Hono's context. Routes read
 * these from `c.var.*` instead of importing singletons, which is what keeps
 * handlers testable with a MemoryStore.
 */
export interface AppBindings {
  Variables: {
    env: Env;
    store: Store;
    counters: CounterStore;
    stripe: StripeGateway;
    /** Set by the apiKeyAuth / sessionAuth middleware once authenticated. */
    developer?: DeveloperRecord;
  };
}

export interface AppDeps {
  env: Env;
  store: Store;
  counters: CounterStore;
  stripe: StripeGateway;
}
