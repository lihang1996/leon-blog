# 个人博客：AI 协作开发与 Next.js 学习任务规划

> 版本：v1.2（2026-07-29 UI 实施基线同步版）  
> 依据：`01-产品需求文档-PRD.md` v1.0、`02-技术架构设计.md` v1.2、`design/Leon-Blog-UI设计规范.md` v0.2  
> 适用对象：有前端开发经验，希望借助 AI 完成个人博客并系统学习 Next.js App Router 的开发者  
> 预计周期：P0 为 8 周、95～120 小时；P1 在 P0 上线后按价值逐项实施

---

## 0. 执行基线

本规划只负责安排实现顺序，不改变产品范围和架构。发生冲突时，依次服从 PRD 和技术架构。

| 决策项 | 本规划使用的唯一方案 |
|---|---|
| 应用 | 单仓库、单个 Next.js 16 App Router 应用；项目根目录即应用根 |
| 项目组织 | 单项目 pnpm；不创建 pnpm workspace，不创建 `apps/web` 或 `apps/api` |
| 页面读取 | 公共 Server Components 直接调用只读 Query Service，不请求本应用 API |
| 浏览器写入 | 管理端最小 Client Components 调用同源 `/api/v1/admin/*` Route Handlers |
| 内容写入入口 | 只使用管理 Route Handlers；不增加内容 Server Actions 或独立后端 |
| 数据库 | PostgreSQL + Prisma ORM 7 + `@prisma/adapter-pg` |
| 认证 | Auth.js Credentials + Argon2id + 加密 JWT Session Cookie |
| 权限 | `proxy.ts` 只做体验跳转；页面读取和每个管理接口都调用 `requireAdmin()` |
| API 契约 | Zod、DTO、接口表和集成测试；不引入 OpenAPI 或生成客户端 |
| 样式 | UI 规范 v0.2 + Tailwind CSS + 语义 CSS 变量；shadcn/ui 按实际组件需要逐个引入 |
| 字体 | P0 使用中文系统字体回退栈，不下载中文 Web Font；P1 只有在授权、体积和性能复核后才可用 `next/font/local` |
| 响应式 | 移动优先；默认、`md >= 768 px`、`lg >= 1024 px`；不另建一套断点 |
| 首页作品证据 | 一条本地站点静态配置；不增加项目表、项目后台、项目 API 或 `/projects` 路由 |
| 主题 | P0 浅色但组件只消费语义变量；P1 才实现浅色/深色/跟随系统切换 |
| Markdown | 原文入库；`react-markdown` 安全渲染；Shiki 服务端代码高亮 |
| 缓存 | Next.js 16 Cache Components；显式 `'use cache'`、`cacheLife`、`cacheTag` |
| 发布刷新 | 事务提交后执行精确 `revalidatePath` 和 `revalidateTag(tag, "max")` |
| 图片 | P0 录入 HTTPS 白名单 URL；P1 使用 Vercel Blob 浏览器直传 |
| slug | P0 发布后锁定；P1 才增加历史 slug 表和 308 永久跳转 |
| 测试 | Vitest、Testing Library、Playwright |
| 监控 | P0 结构化日志、requestId、Vercel Logs/Analytics；P1 Sentry |
| 部署 | Local：Docker PostgreSQL；Preview/Production：Vercel + Neon |

明确不做：

- NestJS、第二个后端、微服务和多应用 workspace。
- 多用户、RBAC、评论、点赞、收藏和复杂审核流。
- Redis、消息队列、Elasticsearch、GraphQL、API Gateway。
- 数据库 Session 与 JWT Session 并存。
- P0 图片上传、媒体库、定时发布、批量操作、看板和 slug 重定向。
- `/about`、`/projects`、项目 CRUD 或为了首页视觉新增的业务数据模型。
- 为未来客户端提前建设 OpenAPI、生成客户端或重复数据写入入口。

---

## 1. 目标与完成定义

### 1.1 产品产出

P0 上线时必须具备：

- 首页、文章列表、文章详情、分类页、标签页和搜索。
- 首页按已确认方向呈现作者定位、主要分类、最新文章和一条静态作品能力证据；作品证据不形成新产品模块。
- 安全 Markdown、服务端代码高亮、分页、错误/空/加载状态。
- Metadata、canonical、Open Graph、Sitemap、Robots 和 JSON-LD。
- 单管理员登录、退出和页面/接口双层保护。
- 文章草稿、新建、编辑、删除草稿、预览、发布、更新和归档。
- 分类和标签管理、SEO 字段、发布前 slug 管理。
- P0 图片 URL 校验和受控渲染。
- 响应式、无障碍、测试、监控、备份恢复和生产部署。
- UI v0.2 的语义 Token、字体回退、间距、断点、组件状态和 Markdown 排版能够从代码与验收截图追溯。

P1 功能只能在 P0 验收与上线后开始，见第 6 节。

### 1.2 学习产出

学习者需要能够脱离 AI 解释并手写：

- App Router 的 `layout.tsx`、`page.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx`。
- Next.js 16 异步 `params`、`searchParams` 和 Route Handler `context.params`。
- Server Component 与 Client Component 的边界。
- 为什么语义 Token 与系统字体栈既保证一致性又避免中文字体拖慢首屏。
- 为什么手机导航只把展开行为做成 Client Component，而 Header、链接和页面数据仍保留在服务端边界。
- 为什么公共页面直接调用 Query Service，而管理浏览器写入使用 Route Handlers。
- Auth.js Cookie Session、`proxy.ts` 乐观保护与 `requireAdmin()` 权威校验的区别。
- Prisma migration、运行时池化连接和事务边界。
- Cache Components、`revalidatePath` 与双参数 `revalidateTag` 的语义。
- Markdown XSS、图片 URL、CSRF、草稿泄露和环境变量的安全边界。
- Preview 与 Production 的数据库隔离和迁移顺序。

### 1.3 求职产出

- 可访问的生产地址和结构清晰的仓库。
- 3～5 篇真实技术文章。
- README、架构图、数据流、测试说明和部署说明。
- 三个可深入讲解的案例：Server/Client 边界、发布后缓存一致性、安全认证与草稿隔离。
- 一份 AI 协作复盘，明确本人决策、AI 辅助和人工验证。

---

## 2. 实施顺序与项目骨架

### 2.1 依赖顺序

```text
单应用基础
  → UI Token / 字体 / 公共 Layout 与响应式壳层
  → PostgreSQL / Prisma 7 / 初始 migration
  → 领域规则与 Service / Repository
  → Auth.js 与管理权限
  → 分类、标签和文章管理
  → 受保护预览与发布闭环
  → 公共页面与安全 Markdown
  → 缓存、SEO、响应式和无障碍
  → 自动化测试、Preview、Production 与恢复演练
  → P1
```

不能颠倒的关键关系：

- 初始 migration 人工通过前，不开发依赖最终字段的管理 CRUD。
- `requireAdmin()` 集成测试通过前，不开放任何管理读写接口。
- 发布事务正确前，不接入公共缓存。
- P0 URL 图片安全规则通过前，不做 P1 上传。
- P0 slug 锁定与 404 规则通过前，不增加旧地址跳转。
- Preview 验证通过前，不执行生产 migration。
- 没有页面级设计或明确的设计规范验收项时，不让 AI 直接生成整页；文章详情、文章列表和管理端按开发顺序逐页确认。

### 2.2 初始化后的唯一目录骨架

第一周按需创建以下目录；没有任务使用的 P1 目录不提前创建：

```text
src/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── (site)/
│   ├── (auth)/admin/login/
│   ├── (admin)/admin/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   └── v1/
│   ├── sitemap.ts
│   ├── robots.ts
│   ├── not-found.tsx
│   └── global-error.tsx
├── modules/
│   ├── post/
│   ├── category/
│   ├── tag/
│   └── auth/
├── components/
│   ├── site/
│   ├── admin/
│   └── ui/
├── config/
│   └── site-content.ts
├── styles/
│   └── markdown.css
├── lib/
│   ├── db/
│   ├── auth/
│   ├── api/
│   ├── cache/
│   ├── markdown/
│   └── env.ts
├── generated/prisma/
├── auth.ts
└── proxy.ts

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/
├── unit/
├── integration/
└── e2e/

prisma.config.ts
next.config.ts
docker-compose.yml
package.json
pnpm-lock.yaml

public/
└── images/
    └── site/
```

禁止创建 `apps/`、第二个 `package.json`、workspace 配置和独立 API 应用。

---

## 3. 任务粒度与 AI 协作规则

### 3.1 任务卡规格

每个开发任务控制在 0.5～1 天，任务卡必须包含：

- 用户价值和依赖项。
- 允许修改的文件范围。
- 本次学习目标。
- 正常、空、加载和错误路径。
- 本任务对应的设计稿、UI 规范章节或明确的视觉验收项。
- 自动化或手工验收方式。
- 明确排除项。

禁止让 AI 一次生成整个认证、文章管理、缓存或部署模块。

### 3.2 每项任务的六步循环

1. 本人先写任务卡和验收标准。
2. 只读当前任务需要的 1～2 页官方文档。
3. 让 AI 先说明数据流、边界、风险和测试，不立即写代码。
4. 本人创建核心骨架；AI 只补机械代码、测试样例或局部实现。
5. 本人运行检查并让 AI 做针对性代码审查。
6. 本人复述关键机制、记录学习笔记，再提交单一主题的改动。

页面任务在第 2 步额外执行“设计就绪检查”：确认内容层级、移动/桌面布局、交互状态和空/错状态；没有确认的整页设计时，只实现已确定的结构和组件，不让 AI 擅自补一套视觉方向。

### 3.3 本人主写与 AI 可承担范围

| 区域 | 本人必须完成 | AI 可以辅助 |
|---|---|---|
| Next.js 核心 | 路由、Server/Client 边界、异步参数、缓存调用位置 | 组件样板、重复类型、测试数据 |
| 领域规则 | 状态机、发布条件、slug 规则、公开查询约束 | 补边界用例、生成参数化测试 |
| 认证安全 | 方案、Cookie/Session 理解、`requireAdmin()`、CSRF 复核 | 整理测试矩阵、审查遗漏 |
| 数据库 | Schema 设计、migration SQL、事务和索引复核 | CRUD 样板、Seed 示例 |
| Markdown/图片 | URL 策略、XSS 威胁模型、上传安全复核 | 恶意输入测试样例 |
| 缓存 | Tag/Path 集合、失效时机、SWR 语义 | 生成重复测试或日志断言 |
| 部署 | 环境变量、migration、备份/恢复、生产批准 | CI 配置草稿、检查清单 |
| UI | 设计稿取舍、信息层级、Token、组件边界、响应式、键盘与无障碍判断 | Tailwind 重复样式、状态样板、固定 Seed 截图脚本和差异汇总 |

### 3.4 必须人工复核的红线

以下任务即使 AI 生成了可运行代码，也不能直接合并：

- Auth.js 版本、Credentials、JWT Session、Cookie、CSRF、WAF 和账号锁定。
- Prisma Schema、所有 migration SQL、生产连接和事务。
- Cache Components 配置、发布后失效路径与 Tag。
- P0 图片 URL 白名单和 P1 Blob Token、MIME、大小、回调与删除规则。
- slug 锁定、P1 事务与 308 跳转。
- Preview/Production 环境变量、迁移、备份恢复和部署。
- 设计 Token 与 UI 规范映射、移动菜单焦点、字体回退、触控目标和视觉回归误差判断。

---

## 4. 八周 P0 开发与学习路线

## 第 1 周：单应用基础、数据库与领域规则

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W1-01 | 0.5 天 | 在仓库根目录初始化单个 Next.js 16、TypeScript、Tailwind、pnpm 项目，配置 lint/typecheck/test/build 脚本 | 本人执行命令并解释选项；AI 只审查配置 | 根目录可运行；无 workspace、`apps/web`、`apps/api` |
| W1-02 | 1 天 | 建立 `(site)`、`(auth)`、`(admin)` 路由组；落实 UI v0.2 语义 Token、系统字体栈、根布局、Header/Main/Footer 和手机导航骨架 | 本人主写路由、Token 映射和 Server/Client 边界；AI 辅助重复 Tailwind 样式 | 登录页不继承管理布局；页面默认 Server Component；只有手机菜单展开为 Client Component；20/32/64 px 页边距、1248 px 容器、44 px 触控目标可验证 |
| W1-03 | 1 天 | 配置 Docker PostgreSQL、`prisma.config.ts`、Prisma 7 generator、driver adapter 和分离的环境变量校验 | 本人主写连接与 env；AI 辅助检查清单 | 应用使用池化 `DATABASE_URL`；CLI 使用 `MIGRATION_DATABASE_URL`；无密钥入库 |
| W1-04 | 1 天 | 实现 P0 User/Post/Category/Tag/PostTag Schema 和初始 migration | 本人审查字段、索引、约束和 SQL；AI 补 Schema 样板 | migration 可在空库应用；邮箱大小写唯一和发布状态约束存在 |
| W1-05 | 0.5 天 | 编写 Seed：单一管理员、分类、标签、草稿和已发布示例文章 | 本人处理临时凭据；AI 可生成非敏感示例内容 | 密码使用 Argon2id；生产不保留 bootstrap 凭据 |
| W1-06 | 1 天 | 手写文章状态、发布条件、slug、标签数量和图片 URL 的纯规则及 Vitest | 本人写实现骨架；AI 补边界用例 | 规则测试通过；不依赖 Next.js 和 Prisma |

### 学习目标

- 理解 App Router 项目结构、路由组和特殊文件。
- 理解语义 CSS 变量、系统字体回退、移动优先断点和最小交互岛。
- 理解 Prisma 7 配置、运行时 adapter、migration 与 Seed 的区别。
- 能说明为什么先固定数据库约束和领域规则，再写页面 CRUD。

### AI 使用方式

- 用 AI 检查目录是否越过单应用边界。
- 用 AI 对照 UI v0.2 检查 Token 缺项、断点和不必要的 `'use client'`。
- 用 AI 生成 migration 审查清单和边界测试数据。
- 不让 AI 决定字段、索引、凭据处理和生产连接。

### 阶段验收

- `lint`、`typecheck`、单元测试和生产构建通过。
- Docker 数据库可以从空库迁移并重复 Seed。
- 仓库根目录就是唯一应用；目录与技术架构一致。
- 首页与登录空壳已经使用最终 Token 和公共壳层，而不是临时的第二套样式。

### 阶段产出

- 可运行的单 Next.js 项目骨架。
- 首个可审查 migration、Seed 和领域规则测试。
- 学习笔记：App Router 目录与 Prisma 连接生命周期。
- UI 基线记录：Token 映射、字体回退、三档断点和手机菜单边界。

---

## 第 2 周：数据访问、业务 Service 与公共 API

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W2-01 | 0.5 天 | 建立全局复用的 Prisma Client/pg Pool 和最小 Repository | 本人主写生命周期；AI 审查热更新与断开问题 | 开发热更新不重复创建连接；请求内不 `$disconnect()` |
| W2-02 | 1 天 | 实现 Public Post Query Service：列表、详情、分类、标签、搜索 | 本人主写 `PUBLISHED` 约束；AI 补 DTO 映射 | 任意公共方法都无法返回草稿或归档文章 |
| W2-03 | 1 天 | 实现 Admin Query 与 Command Service、文章标签事务 | 本人确定事务边界；AI 辅助 CRUD 样板 | 更新文章与标签为单事务；业务规则不在 Route Handler 重复 |
| W2-04 | 1 天 | 实现 `/api/v1/posts`、分类、标签、搜索等公共 Route Handlers | 本人主写边界和异步 params；AI 辅助响应样板 | 分页/输入校验/404 正确；只调用 Service |
| W2-05 | 0.5 天 | 建立统一 Zod 输入、DTO、成功/错误响应和 requestId | 本人定义契约；AI 补重复映射 | 不直接序列化 Prisma Model；错误响应无堆栈 |
| W2-06 | 1 天 | 编写数据库集成测试和“草稿绝不公开”回归测试 | 本人写关键断言；AI 扩展数据组合 | API、Query Service 均通过草稿隔离测试 |

### 学习目标

- 区分 Repository、Query Service、Command Service 与 Route Handler 的职责。
- 掌握 Next.js 16 Route Handler 的 Promise `context.params`。
- 能解释页面为何不通过本应用 API 读取数据。

### AI 使用方式

- 让 AI 生成重复 DTO 映射和参数化测试。
- 让 AI 专项审查 N+1、未受限分页和 Prisma Model 泄露。
- 公开查询的 `PUBLISHED` 条件由本人编写并逐个验证。

### 阶段验收

- 公共 API 契约稳定且有集成测试。
- 草稿、归档文章不能从列表、详情、搜索、分类或标签路径泄露。
- Service/Repository 保持轻量，不引入事件总线或完整 CQRS。

### 阶段产出

- P0 数据访问与 API 基线。
- 公共 DTO、错误码和集成测试报告。

---

## 第 3 周：Auth.js、权限与分类标签后台

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W3-00 | 0.5 天 | 在编码前确认登录页与轻量管理壳层的桌面/移动结构、表单状态和 Token 使用 | 本人决定信息层级和非 SaaS 化边界；AI 只生成局部视觉建议 | 不出现数据大屏、侧栏矩阵或 PRD 外入口；正常、错误、提交中和键盘焦点有明确设计 |
| W3-01 | 1 天 | 按官方文档配置 Auth.js Credentials、12 小时加密 JWT Session 和 `/api/auth/[...nextauth]` | 本人主写并锁定版本；AI 只审查 | 无注册、无数据库 Session、无 Bearer Token |
| W3-02 | 1 天 | 实现 `requireAdmin()`、`sessionVersion`、停用账号检查和最小 Session DTO | 本人主写安全核心；AI 补测试 | 页面数据读取与管理 API 都可调用同一权威校验 |
| W3-03 | 0.5 天 | 实现 `proxy.ts` 乐观跳转和 `/admin/login`、退出交互 | 本人决定边界；AI 辅助表单 | 只靠 `proxy.ts` 不能访问管理数据；登录失败信息统一 |
| W3-04 | 1 天 | 实现 Origin/JSON 管理写保护、失败计数、15 分钟账号锁定 | 本人复核并发更新与枚举风险；AI 补攻击用例 | 伪造 Origin、错误 Content-Type 和锁定绕过均失败 |
| W3-05 | 1 天 | 实现管理壳层、分类 CRUD/排序和标签 CRUD | 本人主写 Route Handlers；AI 辅助 UI 与表格 | 所有管理 GET/写请求先 `requireAdmin()`；删除规则正确 |
| W3-06 | 0.5 天 | Auth 与分类标签 E2E/集成测试 | 本人写越权断言；AI 补正常路径 | 未登录页面跳转、API 401、停用/版本失效和 CSRF 边界通过 |

### 学习目标

- 理解 Auth.js Credentials 的责任边界和加密 Cookie Session。
- 区分 `proxy.ts` 的用户体验保护与 `requireAdmin()` 的真实授权。
- 理解同源 Cookie 写接口仍需要 CSRF 防护。
- 能把公共博客 Token 复用到轻量管理端，同时避免把后台设计成企业工作台。

### AI 使用方式

- 先让 AI 画登录、页面访问和管理 API 三条数据流，再由本人核对。
- 用 AI 枚举绕过方式和测试缺口，不让 AI自行选择认证方案。

### 阶段验收

- 登录、退出、当前用户、账号停用和全端失效闭环。
- 所有管理接口在数据访问前验证管理员。
- 分类、标签可以在管理端完成 P0 操作。

### 阶段产出

- 单管理员认证与授权基线。
- 分类/标签后台和安全回归测试。

---

## 第 4 周：文章管理、预览与发布闭环

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W4-00 | 0.5 天 | 先确认文章列表、编辑、预览的任务流和关键界面状态，不一次生成整个后台模块 | 本人画字段层级、保存/预览/发布顺序；AI 辅助检查遗漏 | 与 PRD 字段、状态机和唯一写入入口一致；无自动保存、上传、媒体库等 P1 能力 |
| W4-01 | 0.5 天 | 实现管理文章列表、状态筛选和分页 | 本人主写 URL 状态；AI 辅助表格 | 草稿、已发布、已归档可查看；空/加载/错误状态完整 |
| W4-02 | 1 天 | 实现新建草稿、编辑和删除草稿 Route Handlers | 本人主写权限和规则；AI 辅助表单字段 | 删除二次确认；已发布文章不能直接删除 |
| W4-03 | 1 天 | 实现 Markdown 文本编辑、手动保存和表单错误恢复 | 本人主写交互边界；AI 辅助表单样板 | 不自研富文本；失败后保留未提交内容；本阶段不自动保存 |
| W4-04 | 0.5 天 | 实现 slug 自动生成、发布前编辑、唯一性和保留词校验 | 本人主写规则；AI 补冲突用例 | 一旦首次发布，即使归档后恢复草稿，P0 UI/API 仍拒绝修改 slug |
| W4-05 | 1 天 | 实现发布、更新、归档和恢复草稿的事务流程 | 本人主写状态机和首次发布时间；AI 补测试 | 非法转换返回 422；`publishedAt` 规则与架构一致 |
| W4-06 | 0.5 天 | 实现受保护、`noindex`、不缓存的草稿预览 | 本人主写保护与复用边界；AI 辅助页面 | 未登录不可预览；预览复用公共 `ArticleContent` |
| W4-07 | 0.5 天 | 实现 SEO 字段、分类标签关联和 P0 图片 URL 输入 | 本人主写白名单；AI 补校验样例 | 封面、分享图、Markdown 图片只接受 HTTPS 白名单 URL |

### 学习目标

- 掌握 Client Component 表单与 Route Handler 写入的数据流。
- 理解状态机、数据库事务和并发唯一约束。
- 能说明草稿预览为何不能进入公共缓存。

### AI 使用方式

- AI 可生成表单重复字段、测试工厂和错误文案。
- 状态转换、事务、slug 锁定和图片安全由本人实现与复核。

### 阶段验收

- “登录 → 新建 → 保存草稿 → 预览 → 发布 → 更新 → 归档”后台流程可执行。
- 管理文章 GET 与全部写接口均有授权测试。
- P0 不出现上传、媒体表或历史 slug 表。

### 阶段产出

- 完整 P0 内容管理闭环。
- 文章状态、slug、图片 URL 和预览测试。

---

## 第 5 周：公共博客、Markdown 与全部页面状态

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W5-00 | 1 天 | 按顺序确认文章详情、文章列表的桌面/移动设计和状态，不同时生成全部页面 | 本人先确认文章详情阅读体验，再确认列表发现路径；AI 生成局部方案和检查清单 | 文章详情覆盖 Markdown/代码/元信息；列表覆盖分页/空状态；均服从 UI v0.2、PRD 和 720 px 阅读宽度 |
| W5-01 | 1 天 | 按首页 v1 方向与 UI v0.2 修正实现首页：作者定位、主要分类、最新文章和一条静态作品证据 | 本人主写 Server Component 数据流、静态配置和响应式布局；AI 辅助重复样式 | 不出现推荐/置顶字段、`/about`、`/projects` 或项目 CRUD；手机分类两列；次级 CTA 指向 `/posts`；作品链接只指向真实外链；空站点可用 |
| W5-02 | 1 天 | 实现 `/posts` 分页列表和 URL `searchParams` | 本人主写异步参数；AI 辅助卡片 | 无效页码规范化；列表不加载正文全文 |
| W5-03 | 1 天 | 实现 `/posts/[slug]`、安全 Markdown 和 Shiki 服务端高亮 | 本人主写安全管线；AI 补恶意样例 | 原始 HTML/危险 URL 不执行；代码块可横向滚动 |
| W5-04 | 1 天 | 实现 `/categories`、`/tags` 索引页及分类/标签文章页 | 本人主写索引数据与动态 params；AI 辅助复用列表 | Header 四个入口都有真实目标；不存在的 slug 返回 404；无文章显示空状态 |
| W5-05 | 0.5 天 | 实现搜索页、关键词和分页 | 本人主写动态查询；AI 辅助输入交互 | 只搜标题/摘要和已发布文章；空关键词不查库 |
| W5-06 | 0.5 天 | 完成 `loading.tsx`、`error.tsx`、`not-found.tsx`、全局错误与表单错误 | 本人定义恢复路径；AI 辅助文案 | 正常、空、加载、404、500 都有可操作界面 |
| W5-07 | 1 天 | 公共页面响应式、字体回退与基础无障碍 | 本人键盘/读屏/200% 缩放检查；AI 辅助 Tailwind | 390/768/1280/1440 视口可用；无页面横向滚动；触控目标、焦点、Label、标题层级合格 |
| W5-08 | 0.5 天 | 使用固定 Seed 对首页和已确认页面做参考图并排审查，记录差异和接受理由 | 本人判断层级、间距、断点和内容真实性；AI 汇总差异 | 首页落实 UI v0.2 第 0 节修正；未确认设计的页面不建立伪精确像素基线 |

### 学习目标

- 熟练使用 Promise `params`/`searchParams`、`notFound()` 和特殊状态文件。
- 判断 Markdown 主体为何保持 Server Component。
- 理解搜索应保持动态、不进入公共长期缓存。
- 学会把设计稿拆成 Server Component、最小交互岛、语义 Token 和多视口验收，而不是逐像素硬编码。

### AI 使用方式

- AI 可给出响应式和无障碍检查建议。
- AI 可汇总参考图与实现截图的可见差异，但不能替代本人决定哪些差异属于系统字体、哪些属于布局缺陷。
- 本人手写页面查询调用、异步参数和 Markdown 安全策略。

### 阶段验收

- 公共页面只直接调用 Query Service，不向本应用 Route Handler 发内部 HTTP。
- 首页、列表、详情、分类、标签和搜索覆盖 P0。
- 草稿和归档内容在所有公共入口都返回不可见结果。
- 首页与 UI v0.2 一致；作品证据仍是静态内容，没有渗入数据库、API 或后台。
- 文章详情和列表在编码前已有被确认的桌面/移动设计或明确状态规范。

### 阶段产出

- 可完整浏览的公共博客。
- Markdown 安全测试和跨视口验收记录。
- 首页与页面参考图的并排审查记录。

---

## 第 6 周：缓存、SEO、性能与主链路 E2E

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W6-01 | 1 天 | 启用 Cache Components，为公共 Query 添加 `'use cache'`、`cacheLife("blog")` 和 Tag | 本人主写缓存边界；AI 审查动态 API 混入 | 搜索、管理、Session、预览不进入公共缓存 |
| W6-02 | 1 天 | 实现文章发布/更新/归档及分类标签变更后的 Path 与 Tag 失效集合 | 本人主写旧/新关联并集；AI 补参数化测试 | 事务提交后才失效；分类/标签变更覆盖索引页、动态页和受影响详情；使用双参数 `revalidateTag(tag, "max")` |
| W6-03 | 1 天 | 实现 Metadata、canonical、Open Graph、默认分享图和安全 JSON-LD | 本人主写回退规则；AI 辅助结构化数据测试 | 草稿不产出公开 SEO；标题/描述/图片回退正确 |
| W6-04 | 0.5 天 | 实现 Sitemap 与 Robots | 本人定义收录范围；AI 辅助测试 | 仅含公开页面；排除 admin、API、草稿、归档 |
| W6-05 | 0.5 天 | 检查图片尺寸、字体、Bundle、N+1 和慢查询 | 本人运行工具并判断；AI 帮助解释报告 | 公共基础 Bundle 不包含编辑器；CLS 与明显 N+1 被修复 |
| W6-06 | 1 天 | 编写“登录 → 发布 → 公共阅读”和缓存刷新 Playwright E2E | 本人写关键断言；AI 补辅助函数 | 首页、列表、详情、分类、标签在写入后得到新数据 |
| W6-07 | 0.5 天 | 为已经确认参考图的页面建立固定 Seed、固定视口视觉快照 | 本人确定稳定区域和容差；AI 辅助截图脚本 | 只覆盖已确认页面；字体抗锯齿差异不掩盖溢出、错位和断点回归 |

### 学习目标

- 精确解释 Cache Components 的显式缓存和 SWR。
- 区分 `revalidatePath` 的路径标记与 `revalidateTag(..., "max")` 的共享数据刷新。
- 掌握动态 Metadata、Sitemap、Robots 和 JSON-LD。

### AI 使用方式

- 让 AI 审查 Tag/Path 覆盖矩阵和 SEO 回退遗漏。
- 不接受 AI 用旧版隐式缓存、单参数 `revalidateTag` 或刷新 webhook 替换既定方案。

### 阶段验收

- 发布、编辑、归档后的数据库与缓存形成闭环。
- SEO P0 项全部可自动或人工验证。
- 主链路 E2E 在桌面和移动视口通过。
- 已确认页面的视觉快照可重复，未把尚未设计的状态误设为永久基线。

### 阶段产出

- 缓存策略测试、SEO 产物和主链路 E2E。
- 学习笔记：一次写入如何影响首页、列表、详情、分类和标签。

---

## 第 7 周：质量、安全与部署准备

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W7-01 | 1 天 | 补齐领域、Service、组件和 API 测试矩阵 | 本人确定风险优先级；AI 补重复用例 | Vitest/Testing Library/集成测试覆盖关键失败路径 |
| W7-02 | 0.5 天 | 完成安全响应头、CSP、请求体限制、日志脱敏和基于 Vercel Logs 的 P0 错误排查 | 本人复核策略；AI 辅助配置草稿 | requestId 可串联请求；密钥/密码/Session 不入日志；错误响应无内部堆栈 |
| W7-03 | 1 天 | 配置 CI：lint、typecheck、test、Prisma validate、build、E2E | 本人决定阻断条件；AI 辅助 YAML | 任一步失败阻止合并；不在 build 中假设自动 lint |
| W7-04 | 1 天 | 配置 Neon Preview 分支、preview migration 与 Vercel Preview | 本人处理环境与权限；AI 提供检查清单 | Preview 不连接生产库；migration 早于 Preview Build；部署受保护；E2E 通过 |
| W7-05 | 0.5 天 | 执行无障碍、响应式、字体回退、空/错状态、视觉差异与性能最终巡检 | 本人人工验收；AI 汇总报告 | 四档视口、200% 缩放、键盘操作、关键页面自动扫描和视觉快照通过 |
| W7-06 | 0.5 天 | 完成依赖漏洞、草稿泄露、越权与 Markdown XSS 回归 | 本人审查严重项；AI 辅助攻击样例 | 无阻塞级安全问题 |

### 学习目标

- 建立测试金字塔和风险驱动测试意识。
- 理解 Preview 环境、数据库分支和 CI 阻断条件。
- 学会从日志、E2E 和生产构建定位服务端/客户端问题。

### AI 使用方式

- AI 可生成测试矩阵、CI 初稿和安全审查清单。
- 环境权限、密钥、迁移目标和严重漏洞判断由本人负责。

### 阶段验收

- Preview 环境可完整演示 P0。
- 所有 CI 检查通过且没有生产凭据进入预览或日志。
- P0 发布候选版本冻结，不混入 P1。

### 阶段产出

- 可部署的 Release Candidate。
- 测试、安全、性能和无障碍报告。

---

## 第 8 周：生产上线、恢复演练与求职材料

### 开发任务

| ID | 用时 | 开发任务 | 本人/AI 分工 | 验收与阶段产出 |
|---|---:|---|---|---|
| W8-01 | 0.5 天 | 审核 Production 环境变量、区域、域名、WAF 和最小权限 | 本人逐项确认；AI 只对照清单 | 运行时池化 URL 与 migration 直连 URL 分开；无 bootstrap 密码 |
| W8-02 | 1 天 | 在人工批准后先执行生产 `prisma migrate deploy`，再部署应用 | 本人执行与监控；AI 不代替批准 | migration 成功后应用上线；健康检查和 Smoke Test 通过 |
| W8-03 | 1 天 | 配置备份并恢复到临时数据库进行演练 | 本人验证可读性；AI 辅助记录步骤 | 可从备份恢复并读取文章、分类、标签和管理员记录 |
| W8-04 | 0.5 天 | 发布 3～5 篇真实文章并完成 SEO/分享图抽检 | 本人创作与检查；AI 可校对 | Sitemap、canonical、OG、Markdown 和代码高亮正确 |
| W8-05 | 1 天 | 编写 README、架构图、数据流、测试/部署说明 | 本人主写取舍；AI 辅助润色 | 文档与最终架构一致，不出现被否决方案 |
| W8-06 | 0.5 天 | 整理演示视频、简历描述和三个面试案例 | 本人讲解；AI 模拟追问 | 能脱离稿件说明 Server/Client、缓存一致性和认证安全 |
| W8-07 | 0.5 天 | 执行 P0 最终验收并建立 P1 基线标签 | 本人签字；AI 汇总证据 | P0 全部通过后才允许创建 P1 分支/任务 |

### 学习目标

- 理解生产 migration 先于应用部署的原因。
- 能独立说明环境变量、数据库池化、备份与恢复。
- 将技术决策转化为求职可讲述的工程案例。

### AI 使用方式

- AI 可辅助 README、复盘结构和面试追问。
- AI 不接触生产密钥，不替代 migration、部署和恢复的人工批准。

### 阶段验收

- 生产环境完成登录—发布—公开阅读 Smoke Test。
- 备份恢复不是“已配置”，而是已经在临时库实测。
- README 和演示内容不夸大功能，不把 P1/P2 写成已完成。

### 阶段产出

- P0 生产版本。
- 恢复演练记录、完整项目文档和求职材料。

---

## 5. P0 交叉验收矩阵

| 检查项 | 必须通过的证据 |
|---|---|
| 产品范围 | PRD P0 页面和后台能力逐条勾选；没有评论、多用户等新增范围 |
| UI 基线 | 语义 Token、系统字体回退、20/32/64 px 页边距、1248/720 px 宽度、`md`/`lg` 断点与组件状态对照 UI v0.2 |
| 首页作品证据 | 只读取 `site-content.ts` 静态配置；没有项目表、项目 API、项目后台、`/about` 或 `/projects` |
| 项目结构 | 根目录单应用；无 NestJS、workspace、`apps/web`、`apps/api` |
| 文章状态 | 状态机单元测试 + 管理 API 集成测试 + 发布 E2E |
| 认证权限 | 未登录页面跳转；未登录 API 401；停用/sessionVersion/Origin 测试 |
| 图片处理 | P0 HTTPS 主机白名单、危险 URL 和 `remotePatterns` 测试 |
| 缓存 | 文章发布/更新/归档和分类标签变更后，首页、列表、详情、分类、标签刷新 E2E |
| slug | 发布前可改、发布后拒绝、冲突 409、归档后 404 |
| SEO | Metadata、canonical、OG、Sitemap、Robots、JSON-LD 抽检 |
| 状态体验 | 正常、空、加载、404、500、表单错误有测试或截图 |
| 响应式/无障碍 | 390、768、1280、1440 视口；键盘与自动扫描 |
| 视觉回归 | 已确认参考图的页面使用固定 Seed 并排审查；首页 v2 回写修正后再启用像素差异门禁 |
| 测试 | lint、typecheck、unit、component、integration、E2E、build 全通过 |
| 部署 | Preview 隔离、生产 migration、Smoke Test、备份恢复记录 |

任何一项未通过，都不能用 P1 功能数量抵消。

---

## 6. P1 任务池：只在 P0 上线后逐项启动

每个 P1 仍拆成 0.5～1 天任务；一次只启动一项，独立 migration 和测试随功能提交。

| ID | 用时 | P1 任务 | 固定实现边界 | 人工复核 |
|---|---:|---|---|---|
| P1-01 | 0.5 天 | 文章目录 | 从 Markdown 标题生成稳定 ID 和层级目录；不把正文改成 Client Component | 标题重复、层级跳跃、键盘定位 |
| P1-02 | 0.5 天 | 相关文章 | 只查 `PUBLISHED`；同分类/共享标签排序；最多 3 篇 | 草稿隔离与查询性能 |
| P1-03 | 0.5 天 | RSS | 只输出已发布文章和站点绝对 URL | XML、日期、转义和缓存 |
| P1-04 | 1 天 | 深浅主题 | 浅色/深色/跟随系统；最小 Client Component；持久化选择 | 首屏闪烁、对比度 |
| P1-05 | 1 天 | 自动保存 | 仅草稿、明确保存状态、失败可重试；不替代手动保存 | 并发覆盖和离页提示 |
| P1-06 | 1 天 | Blob Token 与浏览器直传 | Vercel Blob；`requireAdmin()`；JPEG/PNG/WebP；最大 5 MB；随机路径 | Token、MIME、大小、SVG、回调 |
| P1-07 | 1 天 | 轻量媒体列表 | `media_assets` migration；分页、复制 URL、删除未引用资源 | migration、幂等回调和引用检查 |
| P1-08 | 1 天 | 已发布 slug 修改 | PostgreSQL transaction-level advisory lock 串行化命名空间写入；同事务写历史 slug；历史值永不复用；全部旧地址 308 直达当前 URL | migration、并发、循环/链、归档后 404、缓存 |
| P1-09 | 1 天 | 定时发布 | 增加 `scheduled_at` migration；Vercel Cron 每 5 分钟调用 `CRON_SECRET` 保护的单一 Route Handler；数据库幂等领取；要求 Pro；不引入队列 | migration、鉴权、UTC、并发幂等、缓存刷新 |
| P1-10 | 0.5 天 | 批量操作 | 单一管理批量端点；批量归档或删除草稿 | 权限、部分失败、事务边界 |
| P1-11 | 0.5 天 | 简单数据看板 | 文章/分类数量和最近更新；管理端动态查询 | 不演变成统计平台 |
| P1-12 | 0.5 天 | Sentry 异常监控 | 接入服务端与客户端异常、source map 和环境区分；不记录敏感上下文 | 脱敏、采样、告警测试和构建影响 |

P2 版本历史、导入导出、多管理员、AI 内容辅助、多语言、PWA 和高级全文搜索不进入当前任务池。

---

## 7. 每项任务的 Definition of Done

任务只有同时满足以下条件才算完成：

- 满足任务卡的用户价值和验收标准。
- 没有增加 PRD 外功能或替代架构。
- 页面实现能追溯到已确认设计稿或 UI 规范验收项；没有让 AI 擅自补新视觉方向。
- 正常、空、加载、预期错误和未处理错误已考虑。
- TypeScript、ESLint、相关测试和生产构建通过。
- 没有无理由增加依赖、抽象层或 `'use client'`。
- 组件使用语义 Token，无散落品牌色；手机触控目标、焦点和系统字体回退已验证。
- 管理数据访问前有真实授权，不只依赖页面跳转。
- 不记录或返回密码、Cookie、Session、数据库 URL 和堆栈。
- 本人能解释请求路径、执行环境、数据边界和失败路径。
- 人工复核项留下简短记录。
- 提交只包含一个任务主题。

---

## 8. 第一周可以直接执行的任务清单

严格按顺序执行；每一天结束都运行当时已经配置的检查。

### Day 1：W1-01

- 阅读技术架构第 0、5、18、27 节。
- 在项目根目录初始化单个 Next.js 16 项目。
- 选择 TypeScript、`src/`、App Router、Tailwind 和 pnpm。
- 配置 `lint`、`typecheck`、`test`、`build`。
- 检查没有 workspace、`apps/` 或第二个后端目录。

完成证据：开发服务器、lint、typecheck、build 输出和目录截图。

### Day 2：W1-02

- 阅读官方 Project Structure、Layouts and Pages、Server and Client Components。
- 阅读 UI v0.2 第 0、5～8 节，以及官方 Font、Image 和 Tailwind Responsive 文档。
- 本人创建 `(site)`、`(auth)`、`(admin)` 路由组和基础布局。
- 本人把 UI v0.2 的颜色、间距、宽度和圆角映射为 `globals.css` 语义变量，并配置系统字体回退。
- 实现 Server Component 的 Header/Main/Footer；只把手机菜单展开封装为最小 Client Component。
- 在 390、768、1440 宽度检查 20/32/64 px 页边距、44 px 触控目标、菜单键盘操作和页面无横向滚动。
- 让 AI 只审查目录、Token 缺项、导入方向和不必要的 `'use client'`。

完成证据：首页与登录空壳、三档视口截图、Token 映射表、手机菜单键盘记录和 Server/Client 边界说明。

### Day 3：W1-03

- 启动本地 Docker PostgreSQL。
- 配置 Prisma 7 generator、`prisma.config.ts` 和 `@prisma/adapter-pg`。
- 分开运行时、迁移和测试数据库环境变量。
- 本人画出 Next Runtime → Pooler 与 Prisma CLI → Direct URL 两条连接。

完成证据：连接检查、Prisma validate/generate 和无密钥提交检查。

### Day 4：W1-04

- 按架构建立 P0 Schema。
- 生成初始 migration。
- 逐行审查表、外键、唯一约束、索引、时间类型和删除行为。
- 在空库运行 migration，再检查数据库结构。

完成证据：审查过的 migration SQL 和空库迁移结果。

### Day 5：W1-05

- 编写幂等或可重置的本地 Seed。
- 用临时环境变量创建唯一管理员并哈希密码。
- 创建公开文章、草稿、分类和标签的最小示例。
- 验证生产配置中不保留 bootstrap 密码。

完成证据：Seed 输出和数据库抽查。

### Weekend：W1-06

- 本人先手写状态转换、slug、发布条件和图片 URL 规则。
- 让 AI 只补充边界测试，不改规则。
- 从空白文件复写一条 Next.js 页面路由，解释为何是 Server Component。
- 完成第一周复盘和一次小范围代码自审。

完成证据：规则测试、学习笔记和一组单一主题提交。

---

## 9. AI 提示词模板

### 9.1 任务拆解

```text
你是结对开发者。项目基线是单个 Next.js 16 App Router 应用，
PostgreSQL + Prisma 7，Auth.js Credentials，加密 JWT Session Cookie。
公共 Server Components 直接调用 Query Service，管理写入只走同源 Route Handlers。

当前任务：
[任务]

允许修改：
[文件范围]

设计依据：
[设计稿路径或 UI 规范章节]

验收标准：
[标准]

先不要写代码。请输出：
1. 最小文件改动
2. 请求与数据流
3. Server/Client 边界
4. 语义 Token、响应式和交互状态
5. 正常、空、加载和错误状态
6. 安全、无障碍与测试风险
7. 我应亲自完成的核心部分
8. 明确不应顺便实现的内容
```

### 9.2 局部实现

```text
只实现以下 0.5～1 天任务，不修改无关文件：
[任务]

约束：
- Next.js 16 App Router
- params/searchParams/context.params 按异步 API 处理
- 默认 Server Component
- 只有状态、事件或浏览器 API 的最小组件允许 'use client'
- 使用 UI v0.2 的语义 Token、系统字体栈和默认/`md`/`lg` 断点
- 不创建 `/about`、`/projects`、项目数据模型或另一套视觉系统
- 页面读取不请求本应用 API
- 管理写入只使用既有 Route Handlers
- 不新增产品功能、后端、workspace 或生成客户端
- 补当前任务必要测试

完成后说明每个文件的执行环境、失败路径和验证命令。
```

### 9.3 代码审查

```text
请严格审查这次小范围改动，不重写整个模块。

重点：
1. PRD 与最终架构是否一致
2. Next.js 16 API 与 Server/Client 边界
3. 公共查询是否强制 PUBLISHED
4. 管理读取和写入是否调用 requireAdmin()
5. 事务、缓存、Markdown、图片和环境变量安全
6. UI v0.2、响应式、字体回退、空/加载/错误、SEO、无障碍和视觉回归缺口

只报告影响正确性、安全性、可维护性或学习目标的问题。
每项给出严重程度、位置、原因、最小修改和验证方式。
```

---

## 10. 学习笔记模板

```markdown
# 任务名称

## 用户价值与验收标准

## 我原来的理解

## 使用的 Next.js 概念

## 请求和数据流

## 哪些代码运行在服务端

## 哪些代码运行在浏览器

## 为什么需要或不需要 'use client'

## 正常、空、加载和错误路径

## 安全与缓存边界

## AI 提供了什么

## 我没有接受的 AI 建议及原因

## 自动化与人工验证

## 如果重做一次，我会如何改进
```

---

## 11. 官方学习资料顺序

只按当前任务阅读官方资料，不从旧博客复制版本相关写法：

1. [Next.js Installation](https://nextjs.org/docs/app/getting-started/installation)
2. [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
3. [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
4. [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
5. [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
6. [Font Optimization](https://nextjs.org/docs/app/getting-started/fonts)
7. [Image Optimization](https://nextjs.org/docs/app/getting-started/images)
8. [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
9. [Dynamic Route Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes)
10. [Page File Convention](https://nextjs.org/docs/app/api-reference/file-conventions/page)
11. [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
12. [Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
13. [Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
14. [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
15. [Revalidating](https://nextjs.org/docs/app/getting-started/revalidating)
16. [W3C Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)
17. [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials)
18. [Auth.js Protecting Resources](https://authjs.dev/getting-started/session-management/protecting)
19. [Prisma ORM 7 Upgrade Guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
20. [Prisma Migrate Deploy](https://www.prisma.io/docs/cli/migrate/deploy)
21. [Vercel Blob Client Uploads](https://vercel.com/docs/vercel-blob/client-upload)，仅在 P1-06 开始时阅读。

---

## 12. 执行纪律

1. 每次只做一个 0.5～1 天任务。
2. 先写验收条件，再写代码。
3. Next.js 路由、渲染边界、缓存和安全核心由本人主写。
4. 认证、migration、缓存、图片和部署必须留下人工复核记录。
5. P0 验收前不创建 P1 表、目录、依赖和接口。
6. 不为学习而在正式项目保留第二套实现。
7. 每周至少一次不用 AI 重写关键片段并口头解释。
8. 每个任务执行 lint、typecheck、相关测试和必要的生产构建。
9. PRD 冻结后，AI 不得自行增加评论、点赞、用户系统或其他范围。
10. 上线前，学习者必须能画出登录、发布、缓存刷新和公开阅读的完整数据流。
11. 页面编码前先确认对应设计或 UI 规范验收项；一次只设计和实现一个页面或一个明确组件组。
12. 首页作品证据只能来自静态站点配置，不能借设计之名增加项目后台、数据库表或新路由。
