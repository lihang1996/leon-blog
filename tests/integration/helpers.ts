import type { NextRequest } from "next/server";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/db/prisma";

/**
 * Integration-test helpers (PRD §7.5). All factories write through the SAME
 * Prisma singleton the app uses (pointed at TEST_DATABASE_URL by setup.ts), so
 * the tests exercise real repositories/services against a real PostgreSQL.
 */

export const TEST_ADMIN = { email: "admin@test.dev", password: "TestPass-1234" };

/**
 * Wipe all business tables between tests. `_prisma_migrations` is untouched.
 *
 * Defense-in-depth guard (FIND-203 fix): refuse to TRUNCATE unless the resolved
 * database name carries a `test` marker. setup.ts already points DATABASE_URL at
 * TEST_DATABASE_URL, but this second check guarantees a misconfigured
 * TEST_DATABASE_URL can never wipe a dev/production database.
 */
export async function resetDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run resetDatabase");
  const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to TRUNCATE business tables on non-test database "${dbName}"`);
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "login_throttles", "post_tags", "posts", "tags", "categories", "users" RESTART IDENTITY CASCADE',
  );
}

export async function createAdminUser(
  overrides: Partial<{ email: string; isActive: boolean; sessionVersion: number }> = {},
): Promise<{ id: string; email: string }> {
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? TEST_ADMIN.email,
      displayName: "Test Admin",
      passwordHash: await hash(TEST_ADMIN.password),
      isActive: overrides.isActive ?? true,
      sessionVersion: overrides.sessionVersion ?? 1,
    },
    select: { id: true, email: true },
  });
  return user;
}

export async function createCategory(
  name: string,
  slug: string,
  description?: string,
): Promise<{ id: string; slug: string }> {
  const category = await prisma.category.create({
    data: { name, slug, description: description ?? null },
    select: { id: true, slug: true },
  });
  return category;
}

export async function createTag(name: string, slug: string): Promise<{ id: string; slug: string }> {
  const tag = await prisma.tag.create({
    data: { name, slug },
    select: { id: true, slug: true },
  });
  return tag;
}

export async function createPost(args: {
  authorId: string;
  title: string;
  slug: string;
  excerpt: string;
  contentMd?: string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  categoryId?: string | null;
  tagIds?: string[];
  publishedAt?: Date | null;
}): Promise<{ id: string; slug: string; status: string }> {
  const status = args.status ?? "DRAFT";
  const publishedAt =
    args.publishedAt !== undefined ? args.publishedAt : status === "PUBLISHED" ? new Date("2026-01-01T00:00:00Z") : null;
  const post = await prisma.post.create({
    data: {
      authorId: args.authorId,
      title: args.title,
      slug: args.slug,
      excerpt: args.excerpt,
      contentMd: args.contentMd ?? "# 正文\n\n示例内容",
      status,
      categoryId: args.categoryId ?? null,
      publishedAt,
      postTags: args.tagIds?.length ? { create: args.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    select: { id: true, slug: true, status: true },
  });
  return post;
}

/**
 * Build a web-standard Request for Route Handler tests. Handlers only use
 * Request-compatible APIs (method, headers, json, url), so a standard Request
 * works where a NextRequest is typed.
 */
export function makeRequest(
  url: string,
  init?: {
    method?: string;
    origin?: string | null;
    contentType?: string | null;
    ifMatch?: string | null;
    body?: unknown;
  },
): NextRequest {
  const headers = new Headers();
  if (init?.origin) headers.set("origin", init.origin);
  if (init?.contentType) headers.set("content-type", init.contentType);
  if (init?.ifMatch !== undefined && init.ifMatch !== null) headers.set("if-match", init.ifMatch);

  let body: string | null = null;
  if (init?.body !== undefined) body = JSON.stringify(init.body);

  // Handlers only read Request-compatible fields (method/headers/json/url), so
  // a web-standard Request satisfies NextRequest for the test.
  return new Request(url, {
    method: init?.method ?? "GET",
    headers,
    ...(body !== null && init?.method !== "GET" && init?.method !== "DELETE" ? { body } : {}),
  }) as unknown as NextRequest;
}

/** Route handler context.params shape. */
export function routeContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
