# ThinkCashBack

Ad-supported cashback platform for developers — MVP server base.

Developers embed a lightweight ad surface in their tools; end users see
unobtrusive ads; developers earn a revenue share (80% in V1) on verified
impressions. This repository contains the **monorepo scaffold + backend API
core service** (Wave 2).

## Stack

- **Runtime:** Node.js 20+ / TypeScript (ESM)
- **API:** [Hono](https://hono.dev) (Cloudflare Workers / Fly.io friendly)
- **DB:** Postgres 16 via [Drizzle ORM](https://orm.drizzle.team) (Neon in prod)
- **Cache / counters:** Redis 7 via ioredis (Upstash in prod; in-memory fallback)
- **Auth:** GitHub OAuth → session JWT; per-developer API key + HMAC signing secret
- **Tests:** Vitest (run against an in-memory store — no DB required)

## Layout

```
ThinkCashBack/
├── packages/
│   ├── server/        # Hono API, Drizzle schema/migrations, tests
│   ├── shared/        # shared types, zod schemas, crypto (HMAC) helpers
│   └── client-cli/    # placeholder (Wave 2 deliverable)
├── docker-compose.yml # Postgres 16 + Redis 7 for local dev
└── .github/workflows/ci.yml
```

## Quick start

```bash
pnpm install
cp .env.example .env

# 1. start Postgres + Redis
docker compose up -d

# 2. apply migrations + seed sample data (1 dev, 1 advertiser, 2 campaigns)
pnpm db:migrate
pnpm db:seed        # prints the seeded API key + signing secret

# 3. run the API (http://localhost:8787)
pnpm dev
```

Without `DATABASE_URL` / `REDIS_URL` set, the server boots with an **in-memory
store** so you can poke at endpoints with zero infrastructure (data is not
persisted).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | run the server with hot reload |
| `pnpm build` | type-check + emit `dist/` for every package |
| `pnpm test` | run the Vitest API suite (no DB needed) |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | generate a new Drizzle migration from the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | seed sample data |

## API

Full reference: [`docs/openapi.yaml`](docs/openapi.yaml). All responses use a
common envelope:

```jsonc
{ "success": true,  "data": { /* ... */ }, "error": null }
{ "success": false, "data": null, "error": { "code": "…", "message": "…" } }
```

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | liveness + store readiness |
| `POST /api/v1/auth/github` | none | exchange OAuth code → session JWT (+ creds on first login) |
| `GET /api/v1/me` | session | current developer |
| `GET /api/v1/me/earnings` | session | earnings summary |
| `POST /api/v1/devices` | session | register a device, (re)issue API key + signing secret |
| `POST /api/v1/campaigns` | session | create a campaign |
| `GET /api/v1/campaigns/:id/stats` | session | campaign stats |
| `GET /api/v1/ad` | API key | fetch the best-matching ad |
| `POST /api/v1/impressions` | API key | report a signed impression |

### Impression signing (anti-fraud)

Clients sign each impression with their signing secret over the canonical
payload `campaignId.deviceId.nonce.durationMs` (HMAC-SHA256, hex). The server:

1. verifies the device belongs to the authenticated developer,
2. verifies the HMAC signature,
3. rejects bursts inside the dedup window (per device + campaign, default 5s),
4. enforces a hard `(device_id, nonce)` unique constraint → duplicate ⇒ `409`.

### Dev-mode GitHub login

In non-production, `POST /api/v1/auth/github` accepts a shortcut code
`dev:<githubId>:<email>` so the flow is testable without real OAuth credentials.

## Notes / V1 scope

- Stripe Connect payouts are **stubbed** (columns exist; no live integration).
- The `impressions` table is designed for monthly partitioning in production.
- `signing_secret_hash` holds the symmetric HMAC key; **encrypt at rest** (KMS)
  before production.
- Web dashboard (Wave 3) and the VS Code extension (V2) are out of scope here.
