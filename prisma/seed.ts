/**
 * Leon Blog seed (architecture §8.1 / W1-05).
 *
 * Idempotent: safe to re-run. Creates:
 *  - a single bootstrap admin. On first create, credentials come from
 *    ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD; when the password
 *    variable is empty a random password is generated and printed. Re-runs
 *    leave an existing admin's password unchanged unless an explicit
 *    ADMIN_BOOTSTRAP_PASSWORD is provided (E2E seeding / recovery).
 *  - sample categories/tags,
 *  - example posts covering DRAFT / PUBLISHED / ARCHIVED.
 *
 * The bootstrap password must be removed from the environment after the first
 * admin is created. It never lives in the repo.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the seed");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  // ---- Bootstrap admin ---------------------------------------------------
  const rawEmail = process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@example.com";
  const email = normalizeEmail(rawEmail);
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";

  // `email` has no Prisma @unique (uniqueness lives in the LOWER(email) SQL
  // index), so upsert cannot key on it — look up first, then create/update.
  const existing = await prisma.user.findFirst({ where: { email } });

  let admin: { id: string };
  if (existing) {
    // Idempotent re-runs must NOT silently reset the existing admin's password
    // to a new random value. Only an explicitly provided ADMIN_BOOTSTRAP_PASSWORD
    // (E2E seeding / password recovery) updates it.
    const data: { displayName: string; isActive: boolean; passwordHash?: string } = {
      displayName: "Leon",
      isActive: true,
    };
    if (bootstrapPassword) {
      data.passwordHash = await hash(bootstrapPassword);
    } else {
      console.log(`[seed] admin ${email} already exists — password left unchanged (ADMIN_BOOTSTRAP_PASSWORD not set)`);
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    admin = existing;
  } else {
    // First-time create: use the bootstrap password, or generate + print a random one.
    const password = bootstrapPassword || randomBytes(12).toString("base64url");
    const passwordHash = await hash(password);
    admin = await prisma.user.create({
      data: {
        email,
        displayName: "Leon",
        passwordHash,
        isActive: true,
        bio: "全栈开发者，记录 Next.js 与 TypeScript 的学习与工程实践。",
      },
    });
    if (!bootstrapPassword) {
      console.log(`[seed] bootstrap password: ${password}  (remove ADMIN_BOOTSTRAP_* env vars now)`);
    }
  }

  console.log(`[seed] admin ready: ${email}`);

  // ---- Categories --------------------------------------------------------
  const categories = [
    { name: "前端", slug: "frontend", description: "React、Next.js 与浏览器工程实践", sortOrder: 1 },
    { name: "后端", slug: "backend", description: "API、数据库与服务器端设计", sortOrder: 2 },
    { name: "TypeScript", slug: "typescript", description: "类型系统与工程化", sortOrder: 3 },
    { name: "DevOps", slug: "devops", description: "部署、CI 与运维", sortOrder: 4 },
    { name: "随笔", slug: "essay", description: "技术之外的想法", sortOrder: 5 },
  ] as const;

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder },
      create: { name: c.name, slug: c.slug, description: c.description, sortOrder: c.sortOrder },
    });
  }
  console.log(`[seed] categories: ${categories.length}`);

  // ---- Tags --------------------------------------------------------------
  const tags = [
    { name: "Next.js", slug: "nextjs" },
    { name: "React", slug: "react" },
    { name: "TypeScript", slug: "typescript" },
    { name: "PostgreSQL", slug: "postgresql" },
    { name: "Prisma", slug: "prisma" },
    { name: "性能", slug: "performance" },
    { name: "安全", slug: "security" },
    { name: "工程化", slug: "engineering" },
  ] as const;

  for (const t of tags) {
    await prisma.tag.upsert({
      where: { slug: t.slug },
      update: { name: t.name },
      create: { name: t.name, slug: t.slug },
    });
  }
  console.log(`[seed] tags: ${tags.length}`);

  const getCategory = (slug: string) =>
    prisma.category.findUniqueOrThrow({ where: { slug } });
  const getTag = (slug: string) => prisma.tag.findUniqueOrThrow({ where: { slug } });

  // ---- Posts -------------------------------------------------------------
  const frontend = await getCategory("frontend");
  const typescript = await getCategory("typescript");
  const backend = await getCategory("backend");
  const tagNext = await getTag("nextjs");
  const tagReact = await getTag("react");
  const tagTs = await getTag("typescript");
  const tagPg = await getTag("postgresql");
  const tagPrisma = await getTag("prisma");
  const tagPerf = await getTag("performance");

  const now = new Date();

  async function upsertPost(args: {
    slug: string;
    title: string;
    excerpt: string;
    contentMd: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    categoryId: string | null;
    tagIds: string[];
    publishedAt: Date | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
  }) {
    return prisma.post.upsert({
      where: { slug: args.slug },
      update: {
        title: args.title,
        excerpt: args.excerpt,
        contentMd: args.contentMd,
        status: args.status,
        categoryId: args.categoryId,
        publishedAt: args.publishedAt,
        seoTitle: args.seoTitle ?? null,
        seoDescription: args.seoDescription ?? null,
        postTags: {
          deleteMany: {},
          create: args.tagIds.map((tagId) => ({ tagId })),
        },
      },
      create: {
        authorId: admin.id,
        title: args.title,
        slug: args.slug,
        excerpt: args.excerpt,
        contentMd: args.contentMd,
        status: args.status,
        categoryId: args.categoryId,
        publishedAt: args.publishedAt,
        seoTitle: args.seoTitle ?? null,
        seoDescription: args.seoDescription ?? null,
        postTags: {
          create: args.tagIds.map((tagId) => ({ tagId })),
        },
      },
    });
  }

  // Published example #1
  await upsertPost({
    slug: "nextjs-app-router-cache-consistency",
    title: "Next.js App Router 的缓存一致性实践",
    excerpt:
      "从一次“发布后首页还是旧数据”的线上问题出发，梳理 Cache Components、revalidatePath 与双参数 revalidateTag 的语义，以及为什么失效必须发生在数据库事务提交之后。",
    contentMd: `## 背景

在一次发布流程中，数据库已经写入新文章，但首页和列表仍然显示旧数据。问题的根源在于：**缓存被当成了事实来源**，而正确的顺序是数据库先提交、缓存后失效。

## Cache Components 与 SWR

Next.js 16 的 \`cacheLife\` 提供三个窗口：

- \`stale\`：允许短时间内提供旧数据，同时后台刷新。
- \`revalidate\`：后台重新验证的窗口。
- \`expire\`：超过后强制重新渲染。

\`\`\`ts
cacheLife("blog"); // stale: 300, revalidate: 3600, expire: 86400
cacheTag("posts", \`post:\${slug}\`);
\`\`\`

## 为什么事务后失效

如果先清缓存、后提交事务，而事务随后回滚，缓存里就会缺失本该存在的数据。数据库是事实来源，缓存只是派生层。
`,
    status: "PUBLISHED",
    categoryId: frontend.id,
    tagIds: [tagNext.id, tagReact.id, tagPerf.id],
    publishedAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
    seoTitle: "Next.js App Router 缓存一致性实践",
    seoDescription: "Cache Components、revalidatePath 与 revalidateTag 的语义与事务后失效原则。",
  });

  // Published example #2
  await upsertPost({
    slug: "postgresql-indexes-for-content-apps",
    title: "内容型应用的 PostgreSQL 索引设计",
    excerpt:
      "文章、分类与标签常见查询背后，组合索引、函数索引与唯一约束各自解决什么问题；如何用一次 explain 定位慢查询。",
    contentMd: `## 列表查询的索引

对于 \`WHERE status = 'PUBLISHED' ORDER BY published_at DESC\`，一个组合索引

\`\`\`sql
CREATE INDEX posts_status_published_at_idx
ON posts (status, published_at DESC);
\`\`\`

可以让过滤和排序同时命中索引。

## 邮箱大小写唯一

\`LOWER(email)\` 函数索引在数据库层保证邮箱大小写不敏感的唯一性，应用层只需按规范化邮箱查询。

## 避免 N+1

在 Prisma 中一次 \`include\` 取出分类与标签，而不是在循环里逐条查询。
`,
    status: "PUBLISHED",
    categoryId: backend.id,
    tagIds: [tagPg.id, tagPrisma.id, tagPerf.id],
    publishedAt: new Date(now.getTime() - 7 * 24 * 3600 * 1000),
  });

  // Published example #3
  await upsertPost({
    slug: "typescript-strict-mode-tips",
    title: "TypeScript strict 模式下的常见取舍",
    excerpt:
      "noUncheckedIndexedAccess、精确可选与 DTO 白名单，几个让类型系统真正帮忙的小习惯。",
    contentMd: `## noUncheckedIndexedAccess

开启后，数组索引访问返回 \`T | undefined\`，逼你在解构前先处理越界。

## DTO 而不是 Prisma Model

禁止把 Prisma 模型直接序列化给 API，用一个映射函数输出白名单字段，类型错误会在编译期暴露。
`,
    status: "PUBLISHED",
    categoryId: typescript.id,
    tagIds: [tagTs.id, tagReact.id],
    publishedAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000),
  });

  // Draft example (must never leak to public queries)
  await upsertPost({
    slug: "draft-notes-on-csp",
    title: "（草稿）内容安全策略配置笔记",
    excerpt: "未完成的 CSP 笔记，仅管理员可见。",
    contentMd: `# 待整理

- script-src 与 next 的内联脚本
- style-src 与 Tailwind
`,
    status: "DRAFT",
    categoryId: backend.id,
    tagIds: [tagPerf.id, tagPrisma.id],
    publishedAt: null,
  });

  // Archived example (must 404 on public routes)
  await upsertPost({
    slug: "archived-old-essay",
    title: "一篇已归档的旧随笔",
    excerpt: "这篇文章已下线，不应出现在任何公共入口。",
    contentMd: `这篇内容已经归档。`,
    status: "ARCHIVED",
    categoryId: null,
    tagIds: [],
    publishedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
  });

  console.log("[seed] posts: 5 (3 published / 1 draft / 1 archived)");
  console.log("[seed] done ✓");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
