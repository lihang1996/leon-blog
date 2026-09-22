import "server-only";
import { Prisma, PostStatus } from "@/generated/prisma/client";
import { isNotFoundViolation, isUniqueViolation, prisma } from "@/lib/db/prisma";
import { offsetOf, type PageParams } from "@/lib/pagination";
import { escapeLikePattern } from "@/lib/search";
import { ErrorCodes, conflict, notFound } from "@/lib/errors";

/**
 * Post data access (architecture §9.1 / §8.4). Every PUBLIC query hard-codes
 * `status: "PUBLISHED"` in the WHERE clause — the repository is the last line
 * of defense against draft/archived leakage. Lists use lean selects to avoid
 * pulling full Markdown bodies; relations are joined (no N+1).
 */

const publicListSelect = {
  title: true,
  slug: true,
  excerpt: true,
  coverImageUrl: true,
  publishedAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  postTags: { select: { tag: { select: { name: true, slug: true } } } },
} satisfies Prisma.PostSelect;

const publicDetailSelect = {
  ...publicListSelect,
  contentMd: true,
  seoTitle: true,
  seoDescription: true,
  seoImageUrl: true,
  updatedAt: true,
  author: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.PostSelect;

const adminListSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  status: true,
  coverImageUrl: true,
  categoryId: true,
  category: { select: { name: true } },
  postTags: { select: { tagId: true } },
  publishedAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.PostSelect;

const adminDetailSelect = {
  id: true,
  authorId: true,
  title: true,
  slug: true,
  excerpt: true,
  contentMd: true,
  coverImageUrl: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  seoImageUrl: true,
  categoryId: true,
  category: { select: { name: true, slug: true } },
  postTags: { select: { tagId: true, tag: { select: { name: true, slug: true } } } },
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.PostSelect;

export type PublicPostListRow = Prisma.PostGetPayload<{ select: typeof publicListSelect }>;
export type PublicPostDetailRow = Prisma.PostGetPayload<{ select: typeof publicDetailSelect }>;
export type AdminPostListRow = Prisma.PostGetPayload<{ select: typeof adminListSelect }>;
export type AdminPostDetailRow = Prisma.PostGetPayload<{ select: typeof adminDetailSelect }>;

type PagedResult<T> = { items: T[]; total: number };
export type PublicPostFilters = {
  categorySlug?: string;
  tagSlug?: string;
  keyword?: string;
  sort?: "latest" | "updated";
};

/** Tag ids from a row's postTags array. */
export function tagIdsOf(row: { postTags: { tagId: string }[] }): string[] {
  return row.postTags.map((pt) => pt.tagId);
}

export const postRepository = {
  // ---- Public queries (status: PUBLISHED enforced) ------------------------

  async findPublishedPage(
    { page, pageSize }: PageParams,
    filters: PublicPostFilters = {},
  ): Promise<PagedResult<PublicPostListRow>> {
    const keyword = filters.keyword?.trim();
    const escaped = keyword ? escapeLikePattern(keyword) : null;
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      ...(filters.tagSlug ? { postTags: { some: { tag: { slug: filters.tagSlug } } } } : {}),
      ...(escaped
        ? {
            OR: [
              { title: { contains: escaped, mode: "insensitive" } },
              { excerpt: { contains: escaped, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: publicListSelect,
        orderBy: filters.sort === "updated"
          ? [{ updatedAt: "desc" }, { id: "desc" }]
          : [{ publishedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total };
  },

  async findPublishedBySlug(slug: string): Promise<PublicPostDetailRow | null> {
    return prisma.post.findFirst({
      where: { slug, status: PostStatus.PUBLISHED },
      select: publicDetailSelect,
    });
  },

  async findPublishedNeighbor(slug: string): Promise<PublicPostListRow | null> {
    const current = await prisma.post.findFirst({
      where: { slug, status: PostStatus.PUBLISHED },
      select: { publishedAt: true, id: true },
    });
    if (!current?.publishedAt) return null;

    const older = await prisma.post.findFirst({
      where: {
        status: PostStatus.PUBLISHED,
        OR: [
          { publishedAt: { lt: current.publishedAt } },
          { publishedAt: current.publishedAt, id: { lt: current.id } },
        ],
      },
      select: publicListSelect,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    if (older) return older;
    return prisma.post.findFirst({
      where: { status: PostStatus.PUBLISHED, slug: { not: slug } },
      select: publicListSelect,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
  },

  /** Home page: the `limit` most recent published posts (no Markdown body). */
  async findLatestPublished(limit: number): Promise<PublicPostListRow[]> {
    return prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      select: publicListSelect,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  },

  async searchPublished(keyword: string, { page, pageSize }: PageParams): Promise<PagedResult<PublicPostListRow>> {
    // Escape LIKE wildcards so user input matches literally (§14.1).
    const escaped = escapeLikePattern(keyword);
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      OR: [
        { title: { contains: escaped, mode: "insensitive" } },
        { excerpt: { contains: escaped, mode: "insensitive" } },
      ],
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: publicListSelect,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total };
  },

  async findPublishedByCategorySlug(
    categorySlug: string,
    { page, pageSize }: PageParams,
  ): Promise<{ items: PublicPostListRow[]; total: number }> {
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      category: { slug: categorySlug },
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: publicListSelect,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total };
  },

  async findPublishedByTagSlug(
    tagSlug: string,
    { page, pageSize }: PageParams,
  ): Promise<{ items: PublicPostListRow[]; total: number }> {
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      postTags: { some: { tag: { slug: tagSlug } } },
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: publicListSelect,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total };
  },

  // ---- Admin queries ------------------------------------------------------

  async listAdminPage(
    { page, pageSize }: PageParams,
    status: PostStatus | "ALL",
    sort: "published" | "updated" = "updated",
  ): Promise<PagedResult<AdminPostListRow>> {
    const where: Prisma.PostWhereInput = status === "ALL" ? {} : { status };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: adminListSelect,
        orderBy: sort === "published"
          ? [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }, { id: "desc" }]
          : [{ updatedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total };
  },

  async findAdminById(id: string): Promise<AdminPostDetailRow | null> {
    return prisma.post.findUnique({ where: { id }, select: adminDetailSelect });
  },

  async findAdminBySlug(slug: string): Promise<AdminPostDetailRow | null> {
    return prisma.post.findFirst({ where: { slug }, select: adminDetailSelect });
  },

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.post.findFirst({ where: { slug }, select: { id: true } });
    return row !== null && row.id !== excludeId;
  },

  async isAuthorActive(userId: string): Promise<boolean> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    return row?.isActive ?? false;
  },

  // ---- Writes -------------------------------------------------------------

  async create(data: {
    authorId: string;
    title: string;
    slug: string;
    excerpt: string;
    contentMd: string;
    categoryId: string | null;
    coverImageUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageUrl: string | null;
    tagIds: string[];
  }): Promise<AdminPostDetailRow> {
    try {
      return await prisma.post.create({
        data: {
          authorId: data.authorId,
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          contentMd: data.contentMd,
          categoryId: data.categoryId,
          coverImageUrl: data.coverImageUrl,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          seoImageUrl: data.seoImageUrl,
          postTags: { create: data.tagIds.map((tagId) => ({ tagId })) },
        },
        select: adminDetailSelect,
      });
    } catch (error) {
      // Concurrent duplicate-slug writes race past the slugExists pre-check;
      // the unique index is the final arbiter — surface a stable 409, not a 500.
      if (isUniqueViolation(error)) {
        throw conflict(ErrorCodes.POST_SLUG_EXISTS, "文章 slug 已存在");
      }
      throw error;
    }
  },

  /**
   * Single-transaction update: verifies the referenced tags exist, replaces
   * the tag links, and updates the post. `data` fields are all optional.
   */
  async updateInTransaction(
    id: string,
    data: {
      title?: string;
      slug?: string;
      excerpt?: string;
      contentMd?: string;
      categoryId?: string | null;
      coverImageUrl?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoImageUrl?: string | null;
      tagIds?: string[];
      status?: PostStatus;
      publishedAt?: Date | null;
      expectedVersion: number;
    },
  ): Promise<AdminPostDetailRow> {
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (data.tagIds !== undefined && data.tagIds.length > 0) {
          const found = await tx.tag.count({ where: { id: { in: data.tagIds } } });
          if (found !== data.tagIds.length) {
            throw notFound(ErrorCodes.TAG_NOT_FOUND, "存在不存在的标签");
          }
        }
        return tx.post.update({
          where: { id, version: data.expectedVersion },
          data: {
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.slug !== undefined ? { slug: data.slug } : {}),
            ...(data.excerpt !== undefined ? { excerpt: data.excerpt } : {}),
            ...(data.contentMd !== undefined ? { contentMd: data.contentMd } : {}),
            ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
            ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
            ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
            ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
            ...(data.seoImageUrl !== undefined ? { seoImageUrl: data.seoImageUrl } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
            version: { increment: 1 },
            ...(data.tagIds !== undefined
              ? { postTags: { deleteMany: {}, create: data.tagIds.map((tagId) => ({ tagId })) } }
              : {}),
          },
          select: adminDetailSelect,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict(ErrorCodes.POST_SLUG_EXISTS, "文章 slug 已存在");
      }
      if (isNotFoundViolation(error)) {
        throw conflict(ErrorCodes.POST_CONCURRENT_MODIFICATION, "文章已被其他操作修改，请刷新后重试");
      }
      throw error;
    }
  },

  async deleteDraftConditionally(id: string, expectedVersion: number): Promise<boolean> {
    const result = await prisma.post.deleteMany({
      where: { id, status: PostStatus.DRAFT, version: expectedVersion },
    });
    return result.count === 1;
  },
};

export type PostRepository = typeof postRepository;
