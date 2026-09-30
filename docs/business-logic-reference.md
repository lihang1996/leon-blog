# Leon Blog 业务逻辑全景记录

> 基准：2026-09-27 按当前源码逐模块通读整理（src/ 约 2.3 万行、prisma/、tests/、next.config.ts、design/ 与 delivery/ 文档）。
> 目的：把"这个博客系统怎么运转"完整写下来——数据模型与不变量、文章生命周期状态机、公共读取的缓存体系、管理员认证与写路径的全部防护、受限 Markdown 方言、以及每条业务规则的代码出处。
> 本文以源码为唯一事实来源；产品口径见 PRD（vibecoding 笔记与 delivery 规格），UI 基线见 `design/Leon-Blog-重设计方案-v2.md`（橘猫手记风格）。

---

## 1. 项目定位

Leon Blog 是"个人主页 + 在线简历 + 技术博客 + 作者后台"的个人品牌平台（旧 PRD 定位：第一目标用户是招聘方，第二是技术读者；作者只有 Leon 一人）。

- **C 端（访客，无需登录）**：首页（最新 4 篇 + 分类导航）、文章列表（分类/标签/关键词过滤 + 排序 + 分页）、文章详情（上一篇导航）、分类/标签索引与详情、搜索页；全静态化 + 缓存。
- **B 端（单一管理员）**：登录 → 仪表盘 → 文章管理（草稿/编辑/预览/发布/归档/恢复/删除）、分类管理（含手绘图标、排序）、标签管理。

技术栈：Next.js 16 App Router（**Cache Components**）、React 19、TypeScript strict、Prisma 7 + PostgreSQL（驱动适配器 `@prisma/adapter-pg` 池化）、Auth.js v5（Credentials + Argon2id + 加密 JWT Cookie）、自研受限 Markdown 渲染器（无三方 HTML 渲染依赖）、Tailwind CSS 4、Vitest（单测 + 数据库集成测试）。

## 2. 架构分层

```
src/app/
  [[...slug]]/page.tsx   唯一的 C 端+B 端页面入口（catch-all 路由分发，见 §7）
  site-shell.tsx         服务端取数后按 route 字符串分发到 16 个视图组件
  api/v1/                REST：公开 6 个读接口 + admin 8 个管理接口
  sitemap.ts / robots.ts SEO（只含公共页，§8.3）
src/components/views/    视图层（客户端组件为主，靠 initialData 启动）
src/modules/             领域模块：post / category / tag / auth
  *.policy.ts            纯规则（无 Next/Prisma，可单测）
  *.schemas.ts           zod 入参 schema
  *.repository.ts        Prisma 数据访问（公共查询硬编码 PUBLISHED）
  *.service.ts           编排（命令返回 ChangeSet 供缓存失效，§6）
  *.dto.ts               出参白名单（Prisma 模型永不跨层泄漏）
src/lib/                 横切：slug/markdown-policy/search/pagination/
                         public-query/cache-invalidation/env/errors/
                         api（same-origin/expected-version/admin-id/…）/
                         auth（require-admin/login-state/callback-url）
src/proxy.ts             边缘中间件：仅做乐观登录重定向（matcher /admin/*）
prisma/                  schema + 4 个 migration + seed
```

## 3. 数据模型与不变量（prisma/schema.prisma）

| 表 | 关键字段/约束 | 说明 |
|---|---|---|
| users | email **无 @unique**——唯一性由 SQL 函数索引 `LOWER(email)` 保证（迁移里手工建 `users_email_lower_uq`）；passwordHash、isActive、sessionVersion、failedLoginCount、lockedUntil | 单管理员；sessionVersion 每次强制下线/改密 +1 使旧 JWT 失效 |
| posts | status 枚举 DRAFT/PUBLISHED/ARCHIVED；slug 全局唯一；version 乐观锁；publishedAt（DB CHECK：PUBLISHED 必有 published_at）；authorId Restrict、categoryId **SetNull** | 三个复合索引：`(status, publishedAt desc)`、`(categoryId, status, publishedAt desc)`、`(authorId, updatedAt desc)` |
| categories | name/slug 各自唯一、icon（手绘图标 key）、sortOrder、version | 删除分类 → 关联文章 categoryId 置空（文章不删） |
| tags | name/slug 唯一、version | — |
| post_tags | 复合主键 (postId, tagId)、双 Cascade | 文章或标签删除时链接自动清理 |
| login_throttles | keyHash 主键（HMAC-SHA256(AUTH_SECRET, source)）、failedCount、windowStartedAt、blockedUntil | 登录来源限流（§5.2），updatedAt 索引供懒清理 |

seed（幂等）：bootstrap 管理员（`ADMIN_BOOTSTRAP_PASSWORD` 空则生成随机密码打印；重复运行不动既有密码，显式设密码 = 恢复模式：重置+解锁+激活+sessionVersion+1）；5 分类/8 标签/5 篇示例文章（3 发布 1 草稿 1 归档——草稿和归档用于验证"永不泄漏到公共查询"）。

## 4. 文章生命周期（post-policy.ts + post-command.service.ts）

### 4.1 状态机
```
DRAFT → PUBLISHED（publish）
PUBLISHED → ARCHIVED（archive，"下线"）
ARCHIVED → DRAFT（restore）
```
任何其他迁移抛 `INVALID_POST_TRANSITION`（422）。

### 4.2 发布就绪校验（validatePublish）
发布（含对已发布文章的内容更新）必须全部通过：标题 1–120、slug 合法且非保留词、摘要 1–300、正文非空且 ≤200KB、**正文里渲染器可识别的图片全部在白名单**（站内相对路径或 ALLOWED_IMAGE_HOSTS 的 HTTPS）、标签 ≤10、SEO 标题 ≤60/描述 ≤160、封面与分享图在白名单、**作者账号 isActive**。发布时 `publishedAt ??= now`（首次发布时间永久保留，重新发布不刷新）。

### 4.3 slug 规则
- 格式 `^[a-z0-9]+(-[a-z0-9]+)*$`、≤160、保留词（admin/api/login/posts/categories/tags/search/sitemap/robots/opengraph-image/not-found）不可用；
- 标题生成：NFKC 归一化后仅保留 a-z0-9-；**含 CJK 的标题（中文博客常态）回落 `post-{8位随机}`**，避免中文语义被剥离后产生误导性 slug；标签名同理回落 `{prefix}-{random}`；
- **发布后锁定**：`isSlugEditable = publishedAt === null`——一旦发布过（含归档态）slug 不可改；
- 唯一性：服务层预查 + 数据库唯一索引双保险（并发冲突竞争态由唯一索引仲裁成 409 POST_SLUG_EXISTS，不是 500）。

### 4.4 删除规则（2026-09 产品决定）
DRAFT、ARCHIVED 可物理删除；**PUBLISHED 必须先归档**（公开内容永远经由显式下线才可删除）。条件删除把状态与版本写进 WHERE（`deleteMany({id, status in [DRAFT,ARCHIVED], version})`）：check-then-act 期间的并发发布会让删除落空 → 409，不丢数据。

### 4.5 更新事务与乐观锁
PATCH 携带 `version`（body 字段；DELETE 用 `If-Match: "N"` 头，格式必须是双引号整数否则 428/422）。更新在单事务内完成：校验标签存在 → 全量替换 post_tags → `update({where:{id, version}, data:{...version+1}})`；版本不匹配（P2025）→ 409 并发冲突。PATCH 语义：`content` 任意字段组合 + 可选 `action`，二者至少一个；**tagIds 只在显式提供时才替换**（防止 partial 更新把标签清空的经典 bug）。

## 5. 认证与会话（auth.ts / auth.service.ts / require-admin.ts）

### 5.1 凭证校验（Argon2id）
- 密码哈希/校验用 `@node-rs/argon2`；
- **时序对齐**：格式合法但无此账号的邮箱也执行一次固定 dummy verify + 一条等价 UPDATE，让"账号不存在/密码错/被锁/被禁"返回相同的 null 与相近耗时，不可枚举账号；
- 进程内并发上限 2（`MAX_CONCURRENT_AUTH_CHECKS`，globalThis 共享）挡哈希风暴；
- 成功路径用**原子条件更新**清零计数并盖 lastLoginAt：WHERE 里带上读取时的 isActive/sessionVersion/lockedUntil/passwordHash 快照——慢哈希期间发生的禁用/改密/新锁定不会被覆盖（竞态输掉=登录失败，不是新会话）。

### 5.2 两层失败限制
1. **来源限流（先执行）**：`login_throttles` 按 HMAC(source) 计数，15 分钟窗口内 4 次失败 → 封锁来源 15 分钟（UPSERT 原子语句，窗口过期自动重置计数）；来源被封锁后失败**不再计入账号**。部署在可信 ingress 之后才传 source，否则不传（X-Forwarded-For 可伪造，auth.ts 明确不信任）。
2. **账号锁定**：连续 5 次失败锁 15 分钟（同一原子 UPDATE 内判定）。**锁定 DoS 防护（FIND-210）**：锁已过期后的下一次失败从 1 重新计数，而不是从陈旧值继续——否则知道管理员邮箱的人可以反复一键重锁。
- 节流表懒清理：每 5 分钟最多删 1000 条 24h 前的过期行（FOR UPDATE SKIP LOCKED），失败只 warn 不影响登录。

### 5.3 会话与授权
- JWT 加密 Session Cookie，12 小时；payload 仅 `{id, displayName, sessionVersion}`；
- `proxy.ts`（edge 中间件，matcher `/admin/*`）只做**乐观重定向**（未登录跳 /admin/login），不碰数据库；
- **权威检查是 `requireAdmin()`**：每个 admin 页面读与每个 /api/v1/admin/* handler 都先调它——验证 cookie 后**回读数据库**核对 isActive 与 sessionVersion（禁用/强退即时生效）；
- 登录页的过期会话通过 `reason=expired` 参数触发清理，避免"cookie 仍有效 → 代理弹回 /admin"死循环（login-state.ts/callback-url.ts 管理 callbackUrl 白名单）。

### 5.4 CSRF 与写防护（admin API 通用前置）
每个 admin 写方法：`assertSameOriginJson`（Origin 必须存在且等于生产 NEXT_PUBLIC_SITE_URL/开发时请求 URL；Content-Type 必须 application/json；DELETE 无 body 只查 Origin）→ `requireAdmin` → `assertAdminUuid`（路径参数 UUID 预检，非法 422 而非 Prisma 500）→ zod schema。全部错误走统一信封（§8.2），带 `X-Request-Id`（req_+12hex，request-context.ts），API 响应一律 `Cache-Control: no-store`。

## 6. 公共读取与缓存体系（架构 §13）

### 6.1 读路径规则
- **repository 是最后一道闸**：所有公共查询 WHERE 硬编码 `status: PUBLISHED`——草稿/归档在任何上层 bug 下也不可能泄漏；
- 列表查询用精简 select（不拉 Markdown 正文）、关系 join 无 N+1；搜索关键词经 `escapeLikePattern` 转义 `%/_/\`（Prisma contains=LIKE，防通配符注入语义）；
- 分页钳制：默认 10（首页/详情侧栏 4/6）、最大 50、page ≤ 100000（防巨型 OFFSET）；**越界页在渲染前 301 纠正到最后一页**（publicPageRedirect，FIND-207：不给假空态、不缓存废页键）。

### 6.2 Cache Components（Next.js 16）
- 公共读函数标 `"use cache"` + `cacheLife("blog")`（stale 300s / revalidate 3600s / expire 86400s，next.config.ts）+ `cacheTag(posts | post:slug | category:slug | tag:slug …)`；
- **搜索词永远不进缓存键**：带 q 的查询在进入缓存函数之前分支到直查；
- admin 读与搜索一律不缓存。

### 6.3 失效协议（数据库是事实来源）
1. 命令服务返回 `PostChangeSet{old/new Slug、old/new CategorySlug、old/new TagSlugs}`；
2. 路由 handler **在事务提交成功之后**才执行 `applyInvalidation(buildInvalidationPlan(changeSet))`——先清缓存后提交若回滚会造成"缓存缺数据"；
3. 计划取**旧+新关联的并集**（首页、/posts、文章详情新旧 slug、受影响分类/标签索引与详情、连带受影响的已发布文章 slug）；分类/标签 CRUD 用专门的 plan 变体带上受影响文章；
4. `revalidateTag(tag, {expire:0})` 立即失效（不用 max，保证发布/下一条下一次请求即可见）；失效失败只记日志不抛——DB 已提交，缓存只是派生层。

## 7. 页面路由（`src/app/[[...slug]]/page.tsx`）

单一 catch-all 入口先做**已知路由白名单**判定（未知路径直接 notFound，不落入数据查询）：
- 公共：`/`、`/posts[/{slug}]`、`/categories[/{slug}]`、`/tags[/{slug}]`、`/search`；
- 管理：`/admin`、`/admin/{login|dashboard|posts|categories|tags}`、`/admin/posts/new`、`/admin/posts/{uuid}/edit|preview`；
- admin 分支：login 走 resolveLoginState；其余 requireAdmin，**认证类失败 redirect 到登录页并带 callbackUrl+reason=expired**，非认证错误照抛；admin 永不落入公共取数；
- 各列表页取"用户请求的精确页"后做越界纠正；列表/筛选参数经 normalizePublicQuery（q 截 50 字符、sort ∈ latest|updated）；
- 服务端把 initialData 传给 SiteShell，按 route 字符串（如 `post-detail:slug`、`admin:posts-edit:{uuid}`）分发到 16 个视图组件——**所有视图都是客户端组件**，其后交互经 `/api/v1` 增量取数/提交。

## 8. API 面（REST，统一信封）

### 8.1 端点清单
公共（GET，无需登录）：`/api/v1/posts`（分页+q/category/tag/sort）、`/posts/{slug}`、`/categories`、`/categories/{slug}/posts`、`/tags`、`/tags/{slug}/posts`、`/search`。
管理（requireAdmin）：`GET/POST /api/v1/admin/posts`、`GET/PATCH/DELETE /api/v1/admin/posts/{id}`（POST 201 创建草稿；PATCH 内容+状态动作；DELETE 204 + If-Match）、categories/tags 同构 CRUD；`/api/v1/auth/me` 回显当前管理员。

### 8.2 响应契约
成功 `{data}` / 分页 `{data, pagination{page,pageSize,total,totalPages}}` / 删除 204 无 body；错误统一 `{error:{code,message,details?}}`，状态码语义：400 参数、401 未登录/会话失效、403 禁用/跨站、404 不存在、409 slug 重复/并发版本冲突、415 非_json、422 校验失败（details=ValidationIssue[]）、428 缺 If-Match。ErrorCodes 枚举 20 余个（lib/errors.ts）。

### 8.3 SEO
- metadata：文章详情用 seoTitle/seoDescription/seoImage 回落 title/excerpt/cover，OpenGraph article 类型带发布/修改时间；admin/search 页 `noindex`；
- sitemap：只含公共页；**翻页遍历全部已发布页**（pageSize 封顶 50，逐页拉直到耗尽，保证不漏条目）；`lastModified` 用 updatedAt（内容编辑，非首发时间，FIND-212）；
- robots：仅允许公共路径，admin/api 全禁。

## 9. 管理台编辑器（客户端业务）

- **草稿状态**（editor-state.ts）：EditorDraft 全字段 + `serializeEditorSnapshot`（tagIds 排序后 JSON）做脏判定；`editorContent(draft, publishedBefore)` 生成 PATCH 载荷——**已发布文章不再提交 slug 字段**（服务端也锁，双保险）；
- **写入结果分类（防重复提交的核心）**：`mutationNeedsReview` —— 传输错误/5xx/409/版本冲突一律视为"**无法证明没写进去**"：保留当前输入、提示先核对服务器内容再操作、重新加载前确认丢弃；只有明确的 4xx 业务拒绝才允许直接改输入重试；
- **离开守卫**（use-editor-leave-guard）：三层——① `window.navigation` traversal guard（popstate 捕获阶段拦截回退/前进，确认拒绝则 stopImmediatePropagation + history.go 反向回滚）；② beforeunload（刷新/关标签）；③ 捕获阶段拦截同源普通左键链接点击（外链/新标签/修饰键放行走原生流程）。守卫绝不改写历史栈；
- 预览：`/admin/posts/{id}/preview` 独立只读视图，与编辑器分离（需求规格 issue-03：编辑器内预览切换不能替代独立预览）。

## 10. 受限 Markdown 方言（markdown-policy.ts + markdown-content.tsx）

**没有第三方渲染库**——自研分段器 + React 组件，天然免疫 HTML 注入：
- 方言语法：`#`~`######` 标题、`- `/`1. ` 列表、`> ` 引用、`---`/`***` 分隔线、``` 围栏代码（**语言白名单 20 种**，未注册语言回落纯文本防 Shiki 抛错——当前渲染器实际未引 Shiki，代码块带 macOS 红黄绿灯头样式的纯 `<pre>`）、**整行图片** `![alt](url)`（行内/引用式/HTML 图片不渲染，按文本消费）；
- 行内：`**粗体**`、`` `代码` ``、转义字符、`[text](url)` 链接；
- **URL 安全**：链接仅允许 http/https/mailto、站内相对路径（归一化解析，拒绝 `//host` 协议相对与控制字符/`%5c` 编码绕过）；外链自动 `target=_blank rel="noopener noreferrer"`；**图片仅允许站内相对路径或 ALLOWED_IMAGE_HOSTS 白名单 HTTPS**（与 next.config 的 images.remotePatterns 同源配置，无通配符）；
- 发布校验用**同一个分段器**提取图片 URL（`extractMarkdownImageUrls`）——"校验的语法=渲染的语法"，不存在校验了却渲染不出来（或反之）的缝隙。

## 11. 环境与运行配置

| 变量 | 作用 |
|---|---|
| DATABASE_URL / MIGRATION_DATABASE_URL | 运行时池化（pg Pool + adapter-pg）/ Prisma CLI 直连（prisma.config.ts 分离） |
| AUTH_SECRET | JWT 加密 + 来源限流 HMAC 密钥（≥32 字符） |
| NEXT_PUBLIC_SITE_URL | 规范站点 URL（canonical/OAuth/生产 Origin 校验基准） |
| ALLOWED_IMAGE_HOSTS | 图片白名单（发布校验服务端权威；NEXT_PUBLIC_ 镜像给浏览器渲染器；next.config remotePatterns 三处同源） |
| ADMIN_BOOTSTRAP_EMAIL/PASSWORD | 首次播种；用后即删 |

docker-compose 起双库：应用 5432 / 集成测试 5433。安全响应头（next.config headers，全站）：nosniff、X-Frame-Options DENY、**HSTS 2 年**（FIND-211，localhost 不受影响）、Referrer-Policy、Permissions-Policy 收敛、CSP（default-src 'self'；script/style 需 unsafe-inline 供 Next 水合，dev 额外 unsafe-eval；img-src 'self' data: https:；object-src none；frame-ancestors none）。

## 12. 分类与标签规则

- 分类：name≤40 / slug≤60 / 描述≤200 / icon 归一（`^[a-z][a-z-]{0,29}$`，非法归 null）/ sortOrder 0–1000 必填；name 与 slug 分别查重（409）；**删除**：版本核对后直接删（FK SetNull 使文章变为"无分类"），返回受影响文章数与受影响已发布 slug 供缓存失效（UI 先弹确认）；
- 标签：name≤30（保留大小写，仅折叠空白）/ slug≤50；删除仅移除文章↔标签链接（Cascade），同样返回受影响面；
- 两者更新均带乐观版本；改 slug 时找出该分类/标签下**已发布文章的 slug 列表**一并失效详情缓存。

## 13. 测试与质量基建

- 单测 27 个文件（纯规则层）：状态机、slug、分页、搜索转义、Markdown 策略、缓存失效计划、编辑器状态/守卫、same-origin、版本头、公共路由清单等；
- 集成测试 6 个文件（真实 PostgreSQL 5433 容器）：admin-api 全流程、auth（锁定/节流/时序）、post-commands（事务/并发/唯一冲突）、public-queries（草稿泄漏）、category-tag；
- CI（.github/workflows/ci.yml）+ typecheck + eslint；
- 工作区还有两套"流程产物"目录（非运行时依赖）：`.agent-os/evidence/*`（agent-os 交付时的验证证据链：change-plan/verification-report/浏览器冒烟截图等）、`delivery/`（需求规格 + 缺陷修复证据截图）与 `design/`（v2 重设计稿 + 16 张 UI 屏幕截图）——它们记录了"这个系统是怎么被构建与验收的"，不参与运行。

## 14. 设计原则速查

1. **数据库是唯一事实来源**：缓存失效只在事务提交后；失效失败只记日志。
2. **公共面最小暴露**：repository 硬编码 PUBLISHED；sitemap/robots/metadata 同步收敛；未知路由 404。
3. **每个写路径四件套**：同源 CSRF → requireAdmin（DB 复核）→ UUID/zod 入参 → 乐观版本；并发竞争一律收敛为 409 而非数据损坏。
4. **校验语法=渲染语法**：发布校验与渲染共用一个 Markdown 分段器；图片白名单三处同源。
5. **不确定就保守**：编辑器把 5xx/409 归为"需人工核对"；登录竞态输掉=失败；删除带状态条件。
6. **时序不可探测**：登录各失败分支等耗时等响应；JWT 只带最小字段，授权每请求回库。
7. **乐观层+权威层**：proxy 只做体验性重定向，requireAdmin 才是闸门；NEXT_PUBLIC 白名单只是渲染参考，发布校验在服务端。

## 附：与 agent-os 的关系

本项目的需求澄清（旧 specs.json 中《Leon Blog 产品需求文档（修订版）》）、P0 缺陷修复（delivery/功能与体验缺陷修复需求规格说明书-2026-09-25）与实现验证（.agent-os/evidence/ 多轮 change-plan → verification-report → 浏览器冒烟）均由 agent-os 流水线驱动完成；两仓库通过工作区文件协作，无运行时集成。
