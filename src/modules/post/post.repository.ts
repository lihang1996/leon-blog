import "server-only";
import { Prisma, PostStatus } from "@/generated/prisma/client";
import {
  foreignKeyConstraintName,
  isForeignKeyViolation,
  isNotFoundViolation,
  isUniqueViolation,
  prisma,
} from "@/lib/db/prisma";
import { offsetOf, type PageParams } from "@/lib/pagination";
import { escapeLikePattern } from "@/lib/search";
import { ErrorCodes, conflict, notFound } from "@/lib/errors";

/**
 * FR-21 whitelist: the ONLY foreign keys whose violation may be mapped to a
 * business "relation vanished" 404 — the post↔category column and the
 * post↔tag link rows. Every other FK (author, post side of a link) or DB
 * error must take the real internal-error path; a blanket P2003→409/404 is
 * explicitly forbidden (delivery FR-21.4 / 13号 D).
 */
const TAXONOMY_FK_CONSTRAINTS = new Set(["posts_category_id_fkey", "post_tags_tag_id_fkey"]);

/**
 * B01 sentinel: the conditional delete's WHERE matched 0 rows AFTER the
 * taxonomy bumps already ran inside the same transaction. Throwing aborts
 * the transaction (rolling the bumps back); the repository boundary catches
 * it and maps to `false` so the service keeps its boolean→409 contract.
 */
class PostConcurrentModificationError extends Error {
  constructor() {
    super("post concurrently modified between check and delete");
    this.name = "PostConcurrentModificationError";
  }
}

function categoryOfConstraint(constraint: string): "category" | "tag" | null {
  if (constraint === "posts_category_id_fkey") return "category";
  if (constraint === "post_tags_tag_id_fkey") return "tag";
  return null;
}

/**
 * Maps a whitelisted taxonomy-FK violation to the matching relation-missing
 * 404; returns null when the error is not a whitelisted FK (caller rethrows).
 */
function mapTaxonomyForeignKey(error: unknown): ReturnType<typeof notFound> | null {
  if (!isForeignKeyViolation(error)) return null;
  const constraint = foreignKeyConstraintName(error);
  if (!constraint || !TAXONOMY_FK_CONSTRAINTS.has(constraint)) return null;
  const kind = categoryOfConstraint(constraint);
  if (kind === "category") return notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在或已被删除");
  if (kind === "tag") return notFound(ErrorCodes.TAG_NOT_FOUND, "标签不存在或已被删除");
  return null;
}

/**
 * §4.3 lock order: taxonomy rows are always locked BEFORE post rows. Bumping
 * the version is also the membership-epoch marker — a zero-row bump means the
 * target vanished mid-transaction (FR-21 → relation-missing 404).
 */
async function bumpTaxonomyVersion(
  tx: Prisma.TransactionClient,
  target: { kind: "category" | "tag"; id: string },
): Promise<number> {
  const result = target.kind === "category"
    ? await tx.category.updateMany({ where: { id: target.id }, data: { version: { increment: 1 } } })
    : await tx.tag.updateMany({ where: { id: target.id }, data: { version: { increment: 1 } } });
  return result.count;
}

async function bumpTaxonomyOrFail(
  tx: Prisma.TransactionClient,
  target: { kind: "category" | "tag"; id: string },
): Promise<void> {
  const bumped = await bumpTaxonomyVersion(tx, target);
  if (bumped === 0) {
    throw target.kind === "category"
      ? notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在或已被删除")
      : notFound(ErrorCodes.TAG_NOT_FOUND, "标签不存在或已被删除");
  }
}

/**
 * One taxonomy bump with its missing-row policy: targets that ASSERT the row
 * exists (newly linked members) fail the transaction on a zero-row bump;
 * targets that merely release a link (old members) stay silent when the row
 * already vanished.
 */
export type TaxonomyBump = { kind: "category" | "tag"; id: string; failOnMissing: boolean };

/**
 * §4.3 lock discipline (Codex review round 6): every writer that touches
 * MULTIPLE taxonomy rows must acquire their locks in ONE global stable order
 * — all categories first, then tags, each group sorted by id — regardless of
 * input order or add/remove phase. Two writers presenting reversed tag sets
 * would otherwise deadlock A↔B. Pure so the order is unit-testable.
 */
export function orderTaxonomyBumps(bumps: TaxonomyBump[]): TaxonomyBump[] {
  const merged = new Map<string, TaxonomyBump>();
  for (const bump of bumps) {
    if (typeof bump.id !== "string" || bump.id.length === 0) continue;
    const key = `${bump.kind}:${bump.id}`;
    const prev = merged.get(key);
    if (!prev || (!prev.failOnMissing && bump.failOnMissing)) merged.set(key, bump);
  }
  const rank = (bump: TaxonomyBump) => (bump.kind === "category" ? `0:${bump.id}` : `1:${bump.id}`);
  // Code-point comparison, NOT localeCompare: this is a global lock-order
  // contract shared by every process touching these rows, so it must not
  // depend on the machine's ICU default locale (Codex review round 7).
  const compareCodepoints = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...merged.values()].sort((a, b) => compareCodepoints(rank(a), rank(b)));
}

async function applyTaxonomyBumps(tx: Prisma.TransactionClient, bumps: TaxonomyBump[]): Promise<void> {
  for (const bump of orderTaxonomyBumps(bumps)) {
    if (bump.failOnMissing) await bumpTaxonomyOrFail(tx, bump);
    else await bumpTaxonomyVersion(tx, bump);
  }
}

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
      // Single transaction (§4.3): the post AND the membership-epoch bumps of
      // every newly-linked category/tag commit or roll back together. Lock
      // order is taxonomy rows first, then the post row.
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await applyTaxonomyBumps(tx, [
          { kind: "category", id: data.categoryId ?? "", failOnMissing: true },
          ...data.tagIds.map((tagId) => ({ kind: "tag" as const, id: tagId, failOnMissing: true })),
        ]);
        return tx.post.create({
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
      });
    } catch (error) {
      // Concurrent duplicate-slug writes race past the slugExists pre-check;
      // the unique index is the final arbiter — surface a stable 409, not a 500.
      if (isUniqueViolation(error)) {
        throw conflict(ErrorCodes.POST_SLUG_EXISTS, "文章 slug 已存在");
      }
      // Whitelisted taxonomy FK (vanished mid-transaction) → relation-missing
      // 404; anything else keeps the real internal-error path (FR-21).
      const mapped = mapTaxonomyForeignKey(error);
      if (mapped) throw mapped;
      throw error;
    }
  },

  /**
   * Single-transaction update (FR-04 / §4.3): post write AND the
   * membership-epoch bumps of every taxonomy whose member set actually
   * changed commit together. `data` fields are all optional.
   *
   * Lock order: taxonomy rows first (version bumps — a zero-row bump of a
   * newly-added member is the in-transaction relation-missing 404), then the
   * version-guarded post row. The post version guard is what makes the
   * pre-read membership diff safe: every FR-04-compliant membership change
   * bumps the post version, so a stale diff can never pass the guard.
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
        const current = await tx.post.findUnique({
          where: { id },
          select: { version: true, categoryId: true, postTags: { select: { tagId: true } } },
        });
        if (!current || current.version !== data.expectedVersion) {
          throw conflict(ErrorCodes.POST_CONCURRENT_MODIFICATION, "文章已被其他操作修改，请刷新后重试");
        }

        // Membership diff (§4.3): category move A→B bumps both sides once
        // (null side skipped); tags bump ONLY members that actually entered
        // or left the set (order-only reshuffles bump nothing). All bumps —
        // category sides AND added/removed tags MERGED — go through ONE
        // globally ordered pass (categories before tags, ids sorted) so two
        // concurrent writers with reversed tag sets can never deadlock.
        const bumps: TaxonomyBump[] = [];
        if (data.categoryId !== undefined && data.categoryId !== current.categoryId) {
          if (current.categoryId) bumps.push({ kind: "category", id: current.categoryId, failOnMissing: false });
          if (data.categoryId) bumps.push({ kind: "category", id: data.categoryId, failOnMissing: true });
        }
        if (data.tagIds !== undefined) {
          const oldSet = new Set(current.postTags.map((pt) => pt.tagId));
          const newSet = new Set(data.tagIds);
          for (const tagId of newSet) {
            if (!oldSet.has(tagId)) bumps.push({ kind: "tag", id: tagId, failOnMissing: true });
          }
          for (const tagId of oldSet) {
            if (!newSet.has(tagId)) bumps.push({ kind: "tag", id: tagId, failOnMissing: false });
          }
        }
        await applyTaxonomyBumps(tx, bumps);

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
      // Whitelisted taxonomy FK raced past the in-transaction bumps → the
      // relation vanished mid-write → relation-missing 404 with full rollback.
      const mapped = mapTaxonomyForeignKey(error);
      if (mapped) throw mapped;
      throw error;
    }
  },

  /**
   * Conditional hard delete (FR-04 / §4.3): the status guard (DRAFT |
   * ARCHIVED) is part of the WHERE so a concurrent publish/archive between
   * check and delete makes this a no-op (count 0 → 409 at the service layer).
   * The post's former category/tags each get their membership-epoch bump in
   * the SAME transaction — taxonomy rows are locked before the post row, and
   * the cascading link rows go with the post.
   *
   * A count!==1 result MUST abort the transaction (not return false inside
   * the callback): returning normally would COMMIT the taxonomy bumps that
   * already ran, leaving versions changed for a delete that never happened
   * (B01). The sentinel is caught at the boundary to keep the boolean
   * service contract; `beforeDelete` is a test-only synchronization barrier
   * (production callers never pass it) executed after the bumps, right
   * inside the check→delete race window.
   */
  async deleteConditionally(
    id: string,
    expectedVersion: number,
    allowedStatuses: PostStatus[],
    options?: { beforeDelete?: (tx: Prisma.TransactionClient) => Promise<void> },
  ): Promise<boolean> {
    try {
      const deleted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const current = await tx.post.findUnique({
          where: { id },
          select: { status: true, version: true, categoryId: true, postTags: { select: { tagId: true } } },
        });
        if (
          !current ||
          current.version !== expectedVersion ||
          !allowedStatuses.includes(current.status)
        ) {
          return false;
        }
        await applyTaxonomyBumps(tx, [
          ...(current.categoryId
            ? [{ kind: "category" as const, id: current.categoryId, failOnMissing: false }]
            : []),
          ...current.postTags.map((pt) => ({ kind: "tag" as const, id: pt.tagId, failOnMissing: false })),
        ]);
        await options?.beforeDelete?.(tx);
        const result = await tx.post.deleteMany({
          where: { id, status: { in: allowedStatuses }, version: expectedVersion },
        });
        if (result.count !== 1) {
          throw new PostConcurrentModificationError();
        }
        return true;
      });
      return deleted;
    } catch (error) {
      if (error instanceof PostConcurrentModificationError) {
        return false;
      }
      throw error;
    }
  },
};

export type PostRepository = typeof postRepository;
