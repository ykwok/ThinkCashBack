# @thinkcashback/web

Developer dashboard for ThinkCashBack — GitHub login, API key / signing secret
management, device registration, and earnings visualization. Next.js (App
Router) + TypeScript + Tailwind.

## Develop

```bash
pnpm --filter @thinkcashback/web dev   # http://localhost:3000
```

Point the dashboard at a running API (default `http://localhost:8787`):

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL if needed
```

In non-production, log in with the dev shortcut code `dev:<githubId>:<email>`
(e.g. `dev:42:dev@example.com`) — no real GitHub app required.

## Quality gates

```bash
pnpm --filter @thinkcashback/web typecheck
pnpm --filter @thinkcashback/web lint
pnpm --filter @thinkcashback/web test
pnpm --filter @thinkcashback/web build
```

## Pages

- `/login` — GitHub OAuth + non-prod dev shortcut, establishes the session.
- `/` — earnings summary, daily chart + table, account, device registration.
- `/install` — `npm i -g @thinkcashback/cli && thinkcashback login && thinkcashback install`.

## Security notes

The API key and signing secret are returned by the backend exactly once. They
are held in React state + `sessionStorage` (never `localStorage`), masked by
default, and never written to `console`. Registering a device rotates the
credentials (V1: developer-scoped, latest registration wins).
