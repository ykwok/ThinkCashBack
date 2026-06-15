# Multi-stage build for the ThinkCashBack API server (@thinkcashback/server).
#
# IMPORTANT: build with the *repository root* as the context, because the server
# depends on the workspace package packages/shared:
#
#   docker build -f packages/server/Dockerfile -t thinkcashback-server .
#
# ---- build stage --------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

# Whole workspace is copied (node_modules/dist are excluded via .dockerignore),
# so pnpm can resolve the full lockfile and the workspace:* link to shared.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @thinkcashback/shared build \
  && pnpm --filter @thinkcashback/server build

# ---- runtime stage ------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app/packages/server
ENV NODE_ENV=production
ENV PORT=8787
RUN corepack enable

# Copy the built workspace, preserving the pnpm symlink layout so the server can
# resolve @thinkcashback/shared from packages/shared/dist at runtime.
COPY --from=build /app /app

EXPOSE 8787

# Liveness probe against the unauthenticated /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
