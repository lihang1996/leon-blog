import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  postRepository,
  tagIdsOf,
  type PublicPostListRow,
  type PublicPostDetailRow,
  type AdminPostListRow,
  type AdminPostDetailRow,
  type PublicPostFilters,
} from "./post.repository";
import {
  type PublicPostSummaryDTO,
  type PublicPostDetailDTO,
  type AdminPostListItemDTO,
  type AdminPostDTO,
} from "./post.dto";
import { CACHE_TAGS } from "@/lib/cache/cache-invalidation";
import { computePagination, type PageParams } from "@/lib/pagination";
import { normalizePublicPage, normalizePublicQuery } from "@/lib/public-query";
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
    version: row.version,
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
    category: row.category,
    tags: row.postTags.map((pt) => pt.tag),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

// ---- Public cached reads ----------------------------------------------------

async function listPublishedPostsCached(params: PageParams, filters: Omit<PublicPostFilters, "keyword">) {
  "use cache";
  cacheLife("blog");
  cacheTag(
    CACHE_TAGS.posts,
    ...(filters.categorySlug ? [CACHE_TAGS.category(filters.categorySlug)] : []),
    ...(filters.tagSlug ? [CACHE_TAGS.tag(filters.tagSlug)] : []),
  );
  const { items, total } = await postRepository.findPublishedPage(params, filters);
  return { items: items.map(toPublicSummary), pagination: computePagination(params.page, params.pageSize, total) };
}

async function getPublishedPostBySlugCached(slug: string) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts, CACHE_TAGS.post(slug));
  const row = await postRepository.findPublishedBySlug(slug);
  return row ? toPublicDetail(row) : null;
}

async function getPublishedNeighborCached(slug: string) {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.posts, CACHE_TAGS.post(slug));
  const row = await postRepository.findPublishedNeighbor(slug);
  return row ? toPublicSummary(row) : null;
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
  async listPublishedPosts(params: PageParams, filters: PublicPostFilters = {}) {
    const page = normalizePublicPage(params);
    const query = normalizePublicQuery({
      q: filters.keyword,
      category: filters.categorySlug,
      tag: filters.tagSlug,
      sort: filters.sort,
    });
    const normalizedFilters = {
      categorySlug: query.category || undefined,
      tagSlug: query.tag || undefined,
      sort: query.sort,
    };
    // Branch BEFORE the cached function: arbitrary search text must never be
    // serialized into a Cache Components key (even on the filtered posts list).
    if (query.q) {
      const { items, total } = await postRepository.findPublishedPage(page, {
        ...normalizedFilters,
        keyword: query.q,
      });
      return { items: items.map(toPublicSummary), pagination: computePagination(page.page, page.pageSize, total) };
    }
    return listPublishedPostsCached(page, normalizedFilters);
  },
  getPublishedPostBySlug: getPublishedPostBySlugCached,
  getPublishedNeighbor: getPublishedNeighborCached,
  listPostsByCategory(categorySlug: string, params: PageParams) {
    return listPublishedByCategoryCached(categorySlug, normalizePublicPage(params));
  },
  listPostsByTag(tagSlug: string, params: PageParams) {
    return listPublishedByTagCached(tagSlug, normalizePublicPage(params));
  },
  listLatestPublishedPosts(limit: number) {
    return listLatestPublishedCached(normalizePublicPage({ page: 1, pageSize: limit }).pageSize);
  },

  // ---- Dynamic reads (never cached) ----------------------------------------

  async searchPublishedPosts(keyword: string, params: PageParams) {
    const page = normalizePublicPage(params);
    const { q } = normalizePublicQuery({ q: keyword });
    if (!q) return { items: [], pagination: computePagination(page.page, page.pageSize, 0) };
    const { items, total } = await postRepository.searchPublished(q, page);
    return { items: items.map(toPublicSummary), pagination: computePagination(page.page, page.pageSize, total) };
  },

  // ---- Admin reads (never cached) -------------------------------------------

  async listAdminPosts(
    params: PageParams,
    status: PostStatus | "ALL",
    sort: "published" | "updated" = "updated",
  ): Promise<{
    items: AdminPostListItemDTO[];
    pagination: ReturnType<typeof computePagination>;
  }> {
    const { items, total } = await postRepository.listAdminPage(params, status, sort);
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
