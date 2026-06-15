# @thinkcashback/landing

The ThinkCashBack marketing landing page — the product's first touch for
**developers** (earn an 80% revenue share) and **advertisers** (run campaigns).

It is a **static, framework-free** site: all copy lives in typed source
(`src/content.ts`), and a small build step renders it to plain
`dist/index.html` + `dist/styles.css`. No React/Next.js, so it never collides
with the Next.js dashboard in `packages/web`.

## Sections

Hero · How it works (3 steps) · Why developers pick us (80% / zero patches /
signed counting) · Install snippet · For advertisers · Final CTA → developer
dashboard.

The copy reflects the **V1 scope only**: Claude Code CLI, a fixed
**$1.00 / 1,000 impressions** CPM, an **80%** developer share, zero editor
patching, and server-side HMAC-signed impression counting. No RTB/bidding,
VS Code, or Codex are promised.

## Commands

```bash
pnpm --filter @thinkcashback/landing build      # tsc → dist/, then emit index.html + styles.css
pnpm --filter @thinkcashback/landing typecheck  # tsc --noEmit
pnpm --filter @thinkcashback/landing preview     # serve dist/ at http://localhost:4321
```

Root `pnpm build` / `pnpm typecheck` / `pnpm lint` also cover this package.

## Local preview

```bash
pnpm --filter @thinkcashback/landing build
pnpm --filter @thinkcashback/landing preview
# open http://localhost:4321
```

Or just open `packages/landing/dist/index.html` directly in a browser after a
build.

## Configuration

The CTA target defaults to `https://app.thinkcashback.dev/signup`. Override it at
build time without editing source:

```bash
DASHBOARD_URL=https://your-dashboard.example/signup pnpm --filter @thinkcashback/landing build
```
