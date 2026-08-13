import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  postRepository,
  tagIdsOf,
  type PublicPostListRow,
  type PublicPostDetailRow,
  type AdminPostListRow,
  type AdminPostDetailRow,
} from "./post.repository";
import {
  type PublicPostSummaryDTO,
  type PublicPostDetailDTO,
  type AdminPostListItemDTO,
  type AdminPostDTO,
} from "./post.dto";
import { CACHE_TAGS } from "@/lib/cache/cache-invalidation";
import { computePagination, type PageParams } from "@/lib/pagination";
import type { PostStatus } from "./post-policy";

/**
 * Post read services (architecture §4.2 / §9.1).
 *
 * Public reads are cached via Cache Components (`"use cache"` + `cacheLife` +
 * `cacheTag`) and — like every public query — resolve through a repository
 * whose WHERE clause hard-codes `status: PUBLISHED`. Admin reads and search are
 * deliberately NOT cached.
 *
 * Mapping functions live here so neither Repository (Prisma rows) nor
 * Route Handlers / pages (Prisma models) leak across the boundary.
 */

// ---- Mapping ---------------------------------------------------------------

function toPublicSummary(row: PublicPostListRow): PublicPostSummaryDTO {
  return {
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImageUrl: row.coverImageUrl,
    // Every row here is PUBLISHED, and the DB CHECK constraint guarantees
    // published_at is set for published posts.
    publishedAt: row.publishedAt!.toISOString(),
    // Exposed so the sitemap can use the true last-modified time (FIND-212).
    updatedAt: row.updatedAt.toISOString(),
    category: row.category,
    tags: row.postTags.map((pt) => pt.tag),
  };
}

function toPublicDetail(row: PublicPostDetailRow): PublicPostDetailDTO {
  return {
    ...toPublicSummary(row),
    contentMd: row.contentMd,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoImageUrl: row.seoImageUrl,
    updatedAt: row.updatedAt.toISOString(),
    author: { displayName: row.author.displayName, avatarUrl: row.author.avatarUrl },
  };
}

function toAdminListItem(row: AdminPostListRow): AdminPostListItemDTO {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    status: row.status,
    coverImageUrl: row.coverImageUrl,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    tagIds: tagIdsOf(row),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminDetail(row: AdminPostDetailRow): AdminPostDTO {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    contentMd: row.contentMd,
    coverImageUrl: row.coverImageUrl,
    status: row.status,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoImageUrl: row.seoImageUrl,
    categoryId: row.categoryId,
    tagIds: tagIdsOf(row),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---- Public cached reads ----------------------------------------------------

async function listPublishedPostsCached(params: PageParams) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts);
  const { items, total } = await postRepository.findPublishedPage(params);
  return { items: items.map(toPublicSummary), pagination: computePagination(params.page, params.pageSize, total) };
}

async function getPublishedPostBySlugCached(slug: string) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts, CACHE_TAGS.post(slug));
  const row = await postRepository.findPublishedBySlug(slug);
  return row ? toPublicDetail(row) : null;
}

async function listPublishedByCategoryCached(categorySlug: string, params: PageParams) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts, CACHE_TAGS.categories, CACHE_TAGS.category(categorySlug));
  const { items, total } = await postRepository.findPublishedByCategorySlug(categorySlug, params);
  return { items: items.map(toPublicSummary), pagination: computePagination(params.page, params.pageSize, total) };
}

async function listPublishedByTagCached(tagSlug: string, params: PageParams) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts, CACHE_TAGS.tags, CACHE_TAGS.tag(tagSlug));
  const { items, total } = await postRepository.findPublishedByTagSlug(tagSlug, params);
  return { items: items.map(toPublicSummary), pagination: computePagination(params.page, params.pageSize, total) };
}

/** Home page: the N most recent published posts (lean rows, no Markdown body). */
async function listLatestPublishedCached(limit: number) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts);
  const items = await postRepository.findLatestPublished(limit);
  return items.map(toPublicSummary);
}

export const postQueryService = {
  listPublishedPosts: listPublishedPostsCached,
  getPublishedPostBySlug: getPublishedPostBySlugCached,
  listPostsByCategory: listPublishedByCategoryCached,
  listPostsByTag: listPublishedByTagCached,
  listLatestPublishedPosts: listLatestPublishedCached,

  // ---- Dynamic reads (never cached) ----------------------------------------

  async searchPublishedPosts(keyword: string, params: PageParams) {
    const { items, total } = await postRepository.searchPublished(keyword, params);
    return { items: items.map(toPublicSummary), pagination: computePagination(params.page, params.pageSize, total) };
  },

  // ---- Admin reads (never cached) -------------------------------------------

  async listAdminPosts(params: PageParams, status: PostStatus | "ALL"): Promise<{
    items: AdminPostListItemDTO[];
    pagination: ReturnType<typeof computePagination>;
  }> {
    const { items, total } = await postRepository.listAdminPage(params, status);
    return { items: items.map(toAdminListItem), pagination: computePagination(params.page, params.pageSize, total) };
  },

  async getAdminPost(id: string): Promise<AdminPostDTO | null> {
    const row = await postRepository.findAdminById(id);
    return row ? toAdminDetail(row) : null;
  },

  async getAdminPostBySlug(slug: string): Promise<AdminPostDTO | null> {
    const row = await postRepository.findAdminBySlug(slug);
    return row ? toAdminDetail(row) : null;
  },
};
