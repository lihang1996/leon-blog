# Leon Blog

个人技术博客与内容管理平台：C 端面向访客的阅读/搜索/分类标签，B 端面向单一管理员的登录、文章草稿/预览/发布/归档与分类标签管理。

技术栈：Next.js 16 App Router（Server Components + Cache Components）、TypeScript（strict）、Prisma ORM 7 + PostgreSQL、Auth.js（Credentials + Argon2id + 加密 JWT Session Cookie）、受限 Markdown 渲染器、Tailwind CSS 4、Vitest。

> UI 基线见 [`design/Leon-Blog-重设计方案-v2.md`](./design/Leon-Blog-重设计方案-v2.md) 与 `design/ui-screens/`；运行行为以当前代码和测试为准。

---

## 快速开始

### 前置条件

- Node.js ≥ 22，pnpm ≥ 10
- Docker（本地 PostgreSQL 使用 `docker-compose.yml`）

### 1. 启动数据库

```bash
docker compose up -d
```

启动两个容器：`leon_blog`（应用库，端口 5432）与 `leon_blog_test`（集成测试库，端口 5433）。

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env：AUTH_SECRET 至少 32 字符；NEXT_PUBLIC_SITE_URL 改为本地地址
```

`DATABASE_URL`（运行时池化）与 `MIGRATION_DATABASE_URL`（Prisma CLI 直连）已按本地 Docker 预填。

### 3. 安装依赖并生成 Prisma Client

```bash
pnpm install
pnpm prisma:generate
```

### 4. 迁移 + 播种

```bash
pnpm db:migrate      # prisma migrate dev —— 应用初始 migration
pnpm db:seed         # 创建管理员与示例文章
```

Seed 会创建 `admin@example.com` 管理员；`ADMIN_BOOTSTRAP_PASSWORD` 留空时自动生成随机密码并打印到控制台。首次创建后请从环境变量中删除 `ADMIN_BOOTSTRAP_*`。

### 5. 启动开发服务器

```bash
pnpm dev
```

- C 端博客：<http://localhost:3000>
- 管理后台登录：<http://localhost:3000/admin/login>

---

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 生产构建（预渲染公共页面，需要可用的数据库） |
| `pnpm start` | 运行生产构建 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test:unit` | 单元测试（纯规则 / 缓存失效计划 / Markdown 安全策略） |
| `pnpm test:integration` | 数据库集成测试（需要 `postgres-test` 容器） |
| `pnpm prisma:generate` | 生成 Prisma Client |
| `pnpm db:migrate` / `db:deploy` | 开发迁移 / 生产迁移 |
| `pnpm db:seed` | 播种数据 |

---

## 项目结构

```text
src/
├── app/
│   ├── [[...slug]]/             # 公开页面、登录和后台的服务端路由
│   ├── site-shell.tsx           # 页面视图分发
│   ├── api/auth/[...nextauth]/  # Auth.js 路由
│   ├── api/v1/                  # 公共与 /admin 管理 REST API
│   ├── sitemap.ts / robots.ts / opengraph-image.tsx
│   └── globals.css              # UI v0.2 语义 Token
├── modules/                     # 业务模块（post / category / tag / auth）
│   ├── *.service.ts             # 查询 / 命令 Service（读写分离）
│   ├── *.repository.ts          # Prisma 数据访问（公共查询强制 PUBLISHED）
│   ├── *-policy.ts              # 纯领域规则（状态机 / slug / 发布校验）
│   ├── *.schemas.ts             # Zod 输入校验
│   └── *.dto.ts                 # 输出白名单 DTO
├── components/
│   ├── views/                   # 公开页面视图，admin/ 为后台视图
│   └── ui/                      # Header / Button / MarkdownContent 等共享组件
├── lib/
│   ├── auth/require-admin.ts    # 权威权限校验（isActive + sessionVersion）
│   ├── cache/cache-invalidation.ts
│   ├── markdown/                # Markdown 语法提取与 URL 安全规则
│   ├── api/                     # 统一响应 / 错误 / Origin 校验
│   └── env.ts                   # 运行时环境变量校验
├── auth.ts / auth.config.ts / proxy.ts
└── generated/prisma/            # 由 Prisma 生成，不手改

prisma/schema.prisma
prisma/migrations/
prisma/seed.ts
tests/unit/  tests/integration/
```

## 关键架构决策

- **单仓库单应用**：C/B 端与 API 共用一套 Next.js + 模块边界，`app` 不直接访问 Prisma。
- **公共读取**：公共 Server Components 直接调用 Query Service（Repository 的 WHERE 强制 `status = PUBLISHED`，草稿/归档绝不泄露）；管理写入只走同源 `/api/v1/admin/*` Route Handlers。
- **认证**：Auth.js Credentials + Argon2id + 加密 JWT Cookie（12 小时）；`proxy.ts` 只做乐观跳转，`requireAdmin()` 在每个受保护页面/接口做数据库复核。
- **缓存**：Cache Components（`'use cache'` + `cacheLife("blog")` + `cacheTag`）；发布/归档在数据库事务提交后才执行 `revalidatePath` 与 `revalidateTag(…, { expire: 0 })`（立即失效，避免 `"max"` 的 stale-while-revalidate 让列表短暂仍吐旧数据）。
- **Markdown 安全**：受限解析器支持标题、段落、列表、引用、围栏代码、行内代码、粗体、链接和独立图片；不执行原始 HTML，不承诺完整 CommonMark/GFM 或语法高亮。链接仅允许 http/https/mailto、锚点与站内路径；图片仅允许无歧义站内路径或白名单 HTTPS 主机。
- **CSRF**：管理写接口校验同源 `Origin` + 仅接受 `application/json`，Cookie `SameSite=Lax`，不开 CORS。

## 环境变量

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | 运行时池化连接 |
| `MIGRATION_DATABASE_URL` | Prisma CLI / CI 直连 |
| `TEST_DATABASE_URL` | 集成测试独立库 |
| `AUTH_SECRET` | Auth.js 加密密钥（≥ 32 字符） |
| `NEXT_PUBLIC_SITE_URL` | canonical / sitemap / OG 绝对地址 |
| `NEXT_PUBLIC_SITE_NAME` | 站点名 |
| `ALLOWED_IMAGE_HOSTS` | 图片域名白名单（逗号分隔）；构建时固化到浏览器、服务端校验和 `remotePatterns`，变更后必须重新构建部署 |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | 仅一次性 Seed 使用，创建后删除 |

## 测试

- **单元测试**：slug 规则、文章状态机与发布校验、分页、Markdown/图片 URL 安全策略、缓存失效计划。`pnpm test:unit`。
- **集成测试**（PRD §7.5）：草稿/归档公共隔离、登录成功/失败/锁定、未登录管理接口 401、文章创建/编辑/发布/归档状态机、slug 冲突、分类标签 CRUD 与关联、管理 API 的 Origin/Content-Type 校验（含无 body DELETE 不再 415）。需要 `docker compose up -d` 后 `pnpm test:integration`；会自动对独立 `leon_blog_test` 库执行迁移。
- **浏览器验收**：当前未提供自动化 E2E 命令。使用隔离测试库启动应用，验证登录 → 新建 → 草稿 → 预览 → 发布 → 公开阅读 → 归档 → 恢复；另测保存期间输入、未保存离开、过期版本删除、会话失效、URL 翻页恢复、错误重试和移动端布局。
- **真实缓存验收**：集成测试替换了 `next/cache`，必须另外启动生产构建，预热公开页面后执行发布、归档、分类/标签更新，再检查公开页面与 API，不以单元测试代替运行时缓存验收。
- **测试库安全**：`TEST_DATABASE_URL` 必须指向独立且名称包含 `test` 的数据库；集成测试会迁移和清空业务表，不得指向开发或生产数据。

## 已知限制

- **动态段 404 状态码**：`/posts/[slug]`、`/categories/[slug]`、`/tags/[slug]` 在 Next 16.3 Cache Components（Partial Prerender）下，`notFound()` 会渲染 404 页面内容但 HTTP 状态码为 200（静态壳先以 200 提交，动态内容后流式输出）。内容与数据安全均正确（草稿/归档绝不出现在公开响应，`/api/v1` 层返回真实 404），这是 Next 16.3 的既定行为而非本应用缺陷。

## 部署

生产环境先备份并对 PostgreSQL 执行 `prisma migrate deploy`，再部署新版应用；运行时使用池化地址，迁移使用直连地址。文章、分类和标签均使用整数版本控制，更新和删除请求必须携带读取时的版本；不要让不递增版本的旧写入实例与新版长期共存。生产不保留 bootstrap 凭据。

图片白名单属于构建配置，变更 `ALLOWED_IMAGE_HOSTS` 后重新构建，而不是只重启进程。生产 `NEXT_PUBLIC_SITE_URL` 必须等于浏览器访问的外部地址；反向代理需覆盖客户端自带的转发头并限制应用端口直连，在入口配置请求速率与并发限制。

监控结构化日志 `cache.invalidation_failed`。数据库写入成功不代表缓存刷新成功：出现该事件时先排除运行环境错误，再在后台重新保存对应文章以重试失效（不要重复执行创建、删除或切换状态），并以新的公开请求验证结果；持续失败时按托管平台流程清理缓存后复验。归档时必须确认公开详情及列表不再显示该文章。
