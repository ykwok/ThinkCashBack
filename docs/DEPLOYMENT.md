# 部署与本地验证指南

本文覆盖 ThinkCashBack 各 package 的本地部署、验证步骤，以及生产环境清单。
仓库为 pnpm monorepo，需 **Node 20+**、**pnpm 10**、（容器路径）**Docker**。

| package | 角色 | 部署形态 |
| --- | --- | --- |
| `server` | Hono API 核心 | 长驻 Node 服务（容器 / Fly.io / 任意 Node 宿主） |
| `web` | 开发者控制台 | Next.js（Vercel 最契合） |
| `landing` | 营销落地页 | 静态托管（任意 CDN / 对象存储） |
| `client-cli` | 终端 CLI | 发布到 npm |
| `shared` | 共享类型 / 加密 | 内部库，被其它包引用，不单独部署 |

---

## 一、本地最快跑通（零基础设施）

不配 `DATABASE_URL` / `REDIS_URL` 时，server 用 **in-memory store** 启动，数据不持久化，
适合快速验证 API。

```bash
pnpm install
cp .env.example .env
pnpm dev                     # http://localhost:8787
curl -s http://localhost:8787/health
```

`POST /api/v1/auth/github` 在非生产支持快捷码 `dev:<githubId>:<email>`（无需真实 GitHub OAuth）。

---

## 二、本地完整部署（Postgres + Redis）

```bash
# 1. 起 Postgres 16 + Redis 7
docker compose up -d

# 2. 填 .env：至少 DATABASE_URL / REDIS_URL（默认值已对齐 docker-compose）
cp .env.example .env

# 3. 应用迁移 + 灌示例数据（打印出 API key + signing secret）
pnpm db:migrate
pnpm db:seed

# 4. 启动 API
pnpm dev
```

控制台（web）：

```bash
cp packages/web/.env.example packages/web/.env.local   # 默认指向 http://localhost:8787
pnpm --filter @thinkcashback/web dev                    # http://localhost:3000
```

---

## 三、用容器跑 server（推荐的生产同构方式）

`packages/server/Dockerfile` 为多阶段构建，**构建上下文必须是仓库根目录**（server 依赖 `packages/shared`）。

```bash
# 构建镜像
docker build -f packages/server/Dockerfile -t thinkcashback-server .

# 运行（镜像默认 NODE_ENV=production，会强制要求强密钥，缺失则拒绝启动）
docker run --rm -p 8787:8787 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e IP_HASH_SALT=$(openssl rand -hex 16) \
  -e SECRET_ENC_KEY=$(openssl rand -hex 32) \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  thinkcashback-server

curl -s http://localhost:8787/health     # {"status":"ok",...}
```

> 镜像当前约 560MB（包含 dev 依赖）。后续可用 `pnpm deploy`（需开启
> `inject-workspace-packages`）或 esbuild 打包内联 `shared` 来瘦身。

---

## 四、验证清单（每次改动后）

| 命令 | 作用 |
| --- | --- |
| `pnpm build` | 全包 type-check + 产出 `dist/` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest（server / web）+ node:test（cli），**无需数据库** |
| `docker build -f packages/server/Dockerfile -t tcb .` | 验证镜像可构建 |
| 容器 `curl /health` | 验证运行期可启动并就绪 |

CI（`.github/workflows/ci.yml`）在 push / PR 到 `main` 时跑 build + lint + typecheck + test。

---

## 五、环境变量（server）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | - | `development` / `test` / `production` |
| `PORT` | - | 默认 8787 |
| `DATABASE_URL` | 生产必填 | 留空则用 in-memory store（数据不持久化） |
| `REDIS_URL` | 生产必填 | 留空则用单进程内存计数器（多实例不可用） |
| `JWT_SECRET` | **生产强制** | 会话 JWT 签名密钥，**不得**为默认值 |
| `SECRET_ENC_KEY` | **生产强制** | 信令密钥落库加密主密钥（AES-256-GCM）；`openssl rand -hex 32` |
| `IP_HASH_SALT` | **生产强制** | IP 哈希盐，**不得**为默认值 |
| `GITHUB_CLIENT_ID/SECRET/REDIRECT_URI` | 生产必填 | 真实 GitHub OAuth；非生产可用 `dev:` 快捷码 |
| `STRIPE_SECRET_KEY` | - | 留空用内存假网关；`sk_test_...` 走 Stripe 测试模式 |
| `STRIPE_WEBHOOK_SECRET` | 接 Stripe 时 | 校验入站 webhook（`whsec_...`） |
| `PUBLIC_BASE_URL` | 接 Stripe 时 | 构建 Connect 回跳链接 |

> 生产环境若 `JWT_SECRET` / `IP_HASH_SALT` / `SECRET_ENC_KEY` 为空或仍是默认值，
> server 启动时会校验失败并退出（见 `src/env.ts`）。

---

## 六、生产上线前仍需处理（V1 已知项）

1. **Stripe Connect 打款仍是 stub**（`lib/stripe.ts` 假网关）：要么接通真实结算，要么产品上明确"暂不打款"。
2. **`impressions` 表按月分区**：注释声明、`drizzle/0001` 提供分区 SQL，需确认生产实际生效。
3. **密钥托管**：`SECRET_ENC_KEY` 应来自 KMS / Secrets Manager，而非明文环境变量。
4. **生产用 Neon（Postgres）+ Upstash（Redis）**：仅需把对应 URL 填入环境变量。
