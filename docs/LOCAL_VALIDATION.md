# 本地验证与构建操作链路

> **本文与 [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) 的区别**：DEPLOYMENT.md 讲各 package 的部署形态与生产环节；本文是一份**可复现的端到端实战 runbook**——照着做,你能在本地把整条链路(后端 API + Postgres/Redis + CLI + Claude Code 状态栏广告)跑通并逐项验证,并完成 Docker 镜像的构建与运行验证。文中的命令、路径、脚本名、端口均与仓库当前实际一致;凡含 ID 的输出均为**示例**(你本地会得到不同的 UUID)。

## 概述与适用场景

ThinkCashBack 是面向开发者的广告变现平台 MVP(pnpm monorepo):
- **server** — Hono API(Postgres + Redis;无外部依赖时退化为内存 store)
- **client-cli** — 终端 CLI,在 Claude Code 状态栏展示广告并上报签名曝光
- **shared** — 共享类型 / 加密库,被 server 与 cli 引用
- **web / landing** — 控制台与落地页(本文不覆盖)

适用场景:
1. 本地开发与测试(质量闸 + 迁移 + seed)
2. 广告变现链路验证(登录 → 取广告 → 展示 → 签名上报 → 查收益)
3. Docker 生产镜像的构建与强校验验证

## 前置条件

- Node 20+、pnpm 10、Docker(macOS / Linux,本文示例为 zsh)
- 本地 `5432` / `6379` / `8787` 端口空闲
- 仓库根目录(下文记作 `$REPO`,示例 `/Users/Yuan/AI-DEV/ThinkCashBack`)

## 链路总览

```
阶段1 质量闸    pnpm install → build → lint → typecheck → test   (无需数据库)
   ↓
阶段2 基础设施  docker compose up -d → 等 Postgres/Redis healthy
   ↓
阶段3 数据库    显式注入 env → db:migrate → db:seed (→ 可选充值 campaign)
   ↓
阶段4 起服务    server build → node dist/index.js (:8787) → curl /health
   ↓
阶段5 CLI       cli build → 沙箱化 login → install → status / earnings
   ↓
阶段6 状态栏    render.js(run-once,包裹 claude-hud + 叠加广告)→ 核对收益/DB
   ↓
阶段7 Docker    docker build(上下文=仓库根)→ run(强密钥)→ /health → 弱密钥拒启
   ↓
拆除清理        kill server → docker compose down -v → 删沙箱
```

---

## 阶段 1:基础质量闸

```bash
cd $REPO
pnpm install --frozen-lockfile
pnpm build         # 全包 tsc 编译,各包产出 dist/
pnpm lint          # eslint
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest(server/web)+ node:test(cli)
```

**预期**:`build`/`lint`/`typecheck` 无错误;`test` 全绿——server 约 46、web 14、client-cli 约 24(shared/landing 为 `passWithNoTests`)。

> **关键点**:测试使用 in-memory store,**不需要数据库**——这也是为什么"仅 Postgres 才暴露的 SQL 语义问题"在测试里看不出来(参见「常见坑」)。

---

## 阶段 2:基础设施启动

```bash
docker compose up -d
```

**预期**:`tcb-postgres`、`tcb-redis` 两个容器 Started。等待健康:

```bash
docker inspect -f '{{.State.Health.Status}}' tcb-postgres
docker inspect -f '{{.State.Health.Status}}' tcb-redis
```

**预期**:两者均输出 `healthy`(通常几秒内)。若长期 `unhealthy`,用 `docker logs tcb-postgres` 排查。

---

## 阶段 3:环境变量与数据库准备

### 3.1 准备 env(项目不加载 .env)

代码直接读 `process.env`,**没有 dotenv / `--env-file`**。因此 migrate / seed / server 都必须**显式注入环境变量**。实战做法是写一个 env 文件再 `source`:

```bash
cat > ~/tcb-local.env <<EOF
NODE_ENV=development
DATABASE_URL=postgres://thinkcashback:thinkcashback@localhost:5432/thinkcashback
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-only-change-me
IP_HASH_SALT=tcb-dev-salt
# 签名密钥落库加密主密钥。留空=明文落库(dev 可接受);
# 设置后 signing_secret_hash 以 enc:v1: 密文存储(见 5.5 验证)。
SECRET_ENC_KEY=$(openssl rand -hex 32)
DEFAULT_REV_SHARE_BPS=8000
IMPRESSION_DEDUP_WINDOW_MS=5000
EOF
```

> dev 环境用默认 `JWT_SECRET` / `IP_HASH_SALT` 即可;**生产(`NODE_ENV=production`)会强制要求它们与 `SECRET_ENC_KEY` 为强随机非默认值,否则拒绝启动**(见阶段 7)。

### 3.2 迁移 + 种子

```bash
set -a; source ~/tcb-local.env; set +a   # 注入 env 到当前 shell
pnpm db:migrate
pnpm db:seed
```

`db:migrate` 预期:
```
Running migrations...
Migrations applied.
```
应用的迁移含:`0000`(初始表)、`0001`(millicents 精度 + earnings_ledger)、`0002`(campaigns.billed_impressions,计费用单调计数列)。

`db:seed` 预期(**ID 为示例**,你本地是不同 UUID;记下 `apiKey` / `signingSecret` 备用):
```json
Seed complete:
{
  "developerId": "7733ec57-adc0-43e2-adeb-2bf619cd53fb",
  "apiKey": "IyadY0DZioxB6onZ5hBbJsco21OUkv5l",
  "signingSecret": "8f7VnR4--6wocJZtmRtdK1EqyiQqlGy4",
  "advertiserId": "403b4ac3-6bfc-4520-8db2-10a246a4b72a",
  "campaigns": ["3fefda4a-...","8e5de58b-..."]
}
```

### 3.3(可选)给 campaign 充值

seed 出的 campaign `balance_cents=0`,计费几次后会被标记 `exhausted`、影响投放。要让 `/ad` 稳定投放、收益干净累计,可充值:

```bash
docker exec tcb-postgres psql -U thinkcashback -d thinkcashback \
  -c "UPDATE campaigns SET balance_cents = 500000;"
```

---

## 阶段 4:启动服务与验证

```bash
set -a; source ~/tcb-local.env; set +a
pnpm --filter @thinkcashback/server build
node packages/server/dist/index.js
```

**预期启动日志**:
```
ThinkCashBack server listening on :8787 (store=postgres, billing=stripe-fake)
```
(`store=postgres` 说明连上了库;无 `DATABASE_URL` 时会是 `store=in-memory`。)

> 快速迭代也可用 `pnpm dev`(tsx watch,会先编译 shared);同样需要先 `source` env。

**新开一个终端**(server 保持运行)做健康检查:
```bash
curl -s http://localhost:8787/health
```
**预期**:
```json
{"status":"ok","checks":{"store":"up"},"uptimeSeconds":6}
```

---

## 阶段 5:CLI 构建与沙箱化验证

### 5.1 构建 CLI

```bash
pnpm --filter @thinkcashback/cli build
```
产物:`dist/index.js`、`dist/statusline/render.js`、`dist/statusline/tick.js`。

> **CLI 尚未发布到 npm**,所以本地用 `node packages/client-cli/dist/index.js <cmd>`,或在 `packages/client-cli` 下 `npm link`;**不能** `npm i -g @thinkcashback/cli`。

### 5.2 沙箱化(不污染真实 ~/.claude)

```bash
export THINKCASHBACK_API_BASE=http://localhost:8787
export THINKCASHBACK_HOME=/tmp/tcb-demo/home
export CLAUDE_SETTINGS_PATH=/tmp/tcb-demo/home/claude-settings.json
mkdir -p /tmp/tcb-demo/home
```

> **zsh 坑**:`CLI="node …/index.js"; $CLI login` 在 zsh 下不分词会报 "no such file or directory"。用 shell 函数:
> ```bash
> cli() { node $REPO/packages/client-cli/dist/index.js "$@"; }
> ```

### 5.3 登录 → 安装 → 查看

```bash
cli login --code dev:1001:you@example.com    # 非生产快捷码 dev:<githubId>:<email>
cli install
cli status
```

**预期(示例)**:
```
# login
✓ Logged in as you@example.com.

# install
Registered device 1dbe0918-a83a-460f-ad96-6d783283a4e5.
✓ ThinkCashBack installed.
  • statusLine in /tmp/tcb-demo/home/claude-settings.json now renders the ad ...
Restart Claude Code to start earning. Run `thinkcashback status` anytime.

# status
ThinkCashBack status
────────────────────
Logged in:   yes
Registered:  yes (device 1dbe0918-...)
Installed:   yes
  statusLine:   active
────────────────────
Today:  0 impressions · $0.00
Total:  0 impressions · $0.00
```

> 用一个**全新的 githubId**(如 `1001`)首次登录会直接返回一次性凭证;即便用已存在的 id,`cli install` 注册设备时也会重新签发并存下 apiKey/signingSecret。

### 5.4 查询收益

```bash
cli earnings
```
亚分场景(单条 $1 CPM 曝光 ≈ $0.0024)会显示 `$0.00`,但 DB 的 millicents 列非 0:
```
Today:    N impressions   $0.00
Total:    N impressions   $0.00
Pending:  $0.00
Paid:     $0.00
```

### 5.5 核对密钥已加密落库(当 `SECRET_ENC_KEY` 已设置时)

```bash
docker exec tcb-postgres psql -U thinkcashback -d thinkcashback \
  -c "SELECT github_id, left(signing_secret_hash,7) FROM developers ORDER BY created_at;"
```
**预期**:经 CLI 登录创建的开发者其 `signing_secret_hash` 以 `enc:v1:` 开头(AES-256-GCM 密文);而 seed 脚本直接写入的那条是明文。两种格式共存,且签名验证都能通过——证明"密文落库 + 验签时解密"成立。
> 若 `SECRET_ENC_KEY` 留空,则一律明文落库,看不到 `enc:v1:` 前缀。

---

## 阶段 6:状态栏广告渲染验证

`render.js` 是 Claude Code 状态栏的 **run-once 命令**(执行一次→打印→退出):读 stdin 的 session JSON → 运行被包裹的原 statusLine(如 claude-hud)并捕获输出 → 在下方追加当前广告(`✶ <headline> ↗`)→ spawn 一个 detached `tick.js` 在后台取广告 + 上报签名曝光 → 退出。

模拟 Claude Code 调用:
```bash
echo '{"model":{"id":"claude-opus-4-8"},"workspace":{"current_dir":"'"$PWD"'"}}' \
  | node $REPO/packages/client-cli/dist/statusline/render.js
```

**预期**:
- 冷缓存:先显示内置兜底广告 `✶ ThinkCashBack — get paid while you think ↗`,同时后台 `tick` 去拉真实广告(节流 ~45s)。
- 缓存暖了之后:显示真实 campaign,例如 `✶ Try Acme Cloud — 3 months free ↗`。
- 若配置了被包裹的 statusLine(如 claude-hud),它的输出在上、广告另起一行在下。

链路真实性核对:
```bash
# 收益(经多次渲染/上报后)
cli earnings

# DB:曝光计费与收益账本
docker exec tcb-postgres psql -U thinkcashback -d thinkcashback \
  -c "SELECT impressions_count, gross_millicents, dev_share_millicents FROM earnings_ledger;"
docker exec tcb-postgres psql -U thinkcashback -d thinkcashback \
  -c "SELECT left(id::text,8) id, billed_impressions, balance_cents, status FROM campaigns;"
```
**预期**:`earnings_ledger` 有非 0 的 millicents;campaign 的 `billed_impressions` 随被接受的曝光单调递增,`balance_cents` 按 `round(累计曝光*CPM/1000)` 精确扣减。

`/ad` 为**按出价加权轮播**——多次请求高价 campaign 出现更频繁但低价也有份(150:100 出价 ≈ 60/40):
```bash
APIKEY=$(node -e 'console.log(require("/tmp/tcb-demo/home/config.json").api_key)')
for i in $(seq 1 20); do
  curl -s "http://localhost:8787/api/v1/ad?platform=darwin" -H "authorization: Bearer $APIKEY" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.headline))'
done | sort | uniq -c
```

---

## 阶段 7:Docker 镜像构建与生产验证

### 7.1 构建(上下文必须是仓库根)

server 依赖 workspace 包 shared,因此**构建上下文必须是仓库根目录**:
```bash
cd $REPO
docker build -f packages/server/Dockerfile -t thinkcashback-server .
```
**预期**:多阶段构建成功,镜像约 560MB(含 dev 依赖,可后续用打包瘦身)。

### 7.2 运行(生产模式需强密钥)

先停掉本地 `node` server,再运行容器(指向同一套本地 DB/Redis):
```bash
docker run --rm -p 8787:8787 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e IP_HASH_SALT=$(openssl rand -hex 16) \
  -e SECRET_ENC_KEY=$(openssl rand -hex 32) \
  -e DATABASE_URL=postgres://thinkcashback:thinkcashback@host.docker.internal:5432/thinkcashback \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  thinkcashback-server
curl -s http://localhost:8787/health     # → {"status":"ok",...}
```
> 容器内访问宿主机的 Postgres/Redis 用 `host.docker.internal`(macOS/Windows Docker Desktop 默认可用)。镜像默认 `NODE_ENV=production`。

### 7.3 弱密钥拒启(安全验证)

不带强密钥启动,**预期被拒**(这是正确的安全行为):
```bash
docker run --rm -p 8787:8787 -e JWT_SECRET=test thinkcashback-server
```
**预期日志**:
```
Invalid environment configuration:
  - IP_HASH_SALT: IP_HASH_SALT must be set to a strong, non-default value in production
  - SECRET_ENC_KEY: SECRET_ENC_KEY must be set to a strong, non-default value in production
```
进程随即退出(非 0)。

---

## 常见坑

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| **无 dotenv** | migrate 报 `DATABASE_URL is required`,server 日志显示 `store=in-memory` | 显式注入:`set -a; source ~/tcb-local.env; set +a`,或在命令前内联 `KEY=VAL ...` |
| **zsh 不分词** | `$CLI login` → `no such file or directory` | 用 shell 函数 `cli(){ node …/dist/index.js "$@"; }` |
| **CLI 未发 npm** | `npm i -g @thinkcashback/cli` 失败 | 用 `node …/dist/index.js` 或 `npm link` |
| **Docker 上下文** | 构建报找不到 `packages/shared` | 上下文必须是仓库根:`docker build -f packages/server/Dockerfile .` |
| **生产强校验** | 容器秒退、日志 `Invalid environment configuration` | 用 `openssl rand` 生成 `JWT_SECRET`/`IP_HASH_SALT`/`SECRET_ENC_KEY` |
| **campaign 预算为 0** | seed 后 `/ad` 投几次就 `exhausted` | `UPDATE campaigns SET balance_cents=500000;` |
| **enc:v1: 没出现** | `signing_secret_hash` 是明文 | `SECRET_ENC_KEY` 留空就是明文;要密文需先设置该主密钥 |
| **statusLine 契约** | 状态栏不显示/异常 | 当前 Claude Code 的 statusLine 是"跑一次即退出 + 对象格式 `{type:command,command}`";常驻守护进程模型不适用。与 claude-hud 共存靠 render.js **包裹**原命令 |
| **spinnerVerbs 被跳过** | 整份 settings.json 失效 | 当前 Claude Code 期望 `spinnerVerbs` 为 object,写成 array 会让整份 settings 被跳过;CLI 现已不写 spinnerVerbs,广告仅经 statusLine 呈现 |

---

## 拆除与清理

```bash
# 1. 停掉 server(前台 Ctrl+C;或后台进程 kill 掉 :8787 的 node)
lsof -nP -tiTCP:8787 -sTCP:LISTEN | xargs -r kill

# 2. 停并删除容器 + 数据卷
docker compose down -v

# 3. 删沙箱与临时 env
rm -rf /tmp/tcb-demo
rm -f ~/tcb-local.env
```

若曾把广告装进**真实** `~/.claude`(而非沙箱),用以下命令还原(会恢复你原来的 statusLine,如 claude-hud,并保留凭证):
```bash
node $REPO/packages/client-cli/dist/index.js uninstall
```

---

## 命令速查表

| 用途 | 命令 |
| --- | --- |
| 装依赖 | `pnpm install --frozen-lockfile` |
| 质量闸 | `pnpm build && pnpm lint && pnpm typecheck && pnpm test` |
| 起 DB/Redis | `docker compose up -d` |
| 容器健康 | `docker inspect -f '{{.State.Health.Status}}' tcb-postgres` |
| 注入 env | `set -a; source ~/tcb-local.env; set +a` |
| 迁移 / 种子 | `pnpm db:migrate` / `pnpm db:seed` |
| 起 server | `node packages/server/dist/index.js`(或 `pnpm dev`) |
| 健康检查 | `curl -s http://localhost:8787/health` |
| 构建 CLI | `pnpm --filter @thinkcashback/cli build` |
| CLI 登录/安装/状态 | `cli login --code dev:1001:you@example.com` / `cli install` / `cli status` |
| 渲染广告 | `echo '{...}' \| node packages/client-cli/dist/statusline/render.js` |
| 构建镜像 | `docker build -f packages/server/Dockerfile -t thinkcashback-server .` |
| 拆栈 | `docker compose down -v` |

---

## 下一步(生产准备)

本地链路跑通后,参见 [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) 规划生产:`SECRET_ENC_KEY` 等改由 KMS/Secrets Manager 托管;Stripe 由假网关切换为真实 Connect;`impressions` 表分区策略;镜像瘦身;Postgres(Neon)+ Redis(Upstash)托管化。
