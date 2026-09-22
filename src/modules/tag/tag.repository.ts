import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isNotFoundViolation, isUniqueViolation, prisma, uniqueViolationField } from "@/lib/db/prisma";
import { AppError, ErrorCodes, conflict } from "@/lib/errors";

/** Map a P2002 on tags to a stable 409 (name vs slug) instead of a 500. */
function mapTagUniqueConflict(error: unknown): never {
  if (!isUniqueViolation(error)) throw error;
  const field = uniqueViolationField(error);
  if (field === "name") throw conflict(ErrorCodes.TAG_NAME_EXISTS, "标签名称已存在");
  throw conflict(ErrorCodes.TAG_SLUG_EXISTS, "标签 slug 已存在");
}

function mapTagWriteError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (isUniqueViolation(error)) mapTagUniqueConflict(error);
  if (isNotFoundViolation(error)) {
    throw conflict(ErrorCodes.TAG_CONCURRENT_MODIFICATION, "标签已被其他操作修改，请刷新后重试");
  }
  throw error;
}

// Tag has no `posts` relation — the link table is `postTags`, so counts come
// from `_count.postTags` (a filtered count for public, an all-status count for
// the admin side).
const publishedPostCount = {
  postTags: { where: { post: { status: "PUBLISHED" as const } } },
} satisfies Prisma.TagCountOutputTypeSelect;

export const publicTagSelect = {
  id: true,
  name: true,
  slug: true,
  _count: { select: publishedPostCount },
} satisfies Prisma.TagSelect;

export const adminTagSelect = {
  id: true,
  name: true,
  slug: true,
  updatedAt: true,
  version: true,
  _count: { select: { postTags: true } },
} satisfies Prisma.TagSelect;

export type PublicTagRow = Prisma.TagGetPayload<{ select: typeof publicTagSelect }>;
export type AdminTagRow = Prisma.TagGetPayload<{ select: typeof adminTagSelect }>;

export const tagRepository = {
  /** Public index: tags attached to at least one PUBLISHED post. */
  async findPublicTags(): Promise<PublicTagRow[]> {
    const rows = await prisma.tag.findMany({
      select: publicTagSelect,
    });
    return rows
      .filter((row) => row._count.postTags > 0)
      .sort((a, b) => b._count.postTags - a._count.postTags || a.name.localeCompare(b.name, "zh-CN"));
  },

  /** Public detail by slug — exists even when it currently has zero published posts. */
  async findPublicBySlug(slug: string): Promise<PublicTagRow | null> {
    return prisma.tag.findFirst({
      where: { slug },
      select: publicTagSelect,
    });
  },

  async listAdminTags(): Promise<AdminTagRow[]> {
    return prisma.tag.findMany({
      select: adminTagSelect,
      orderBy: { name: "asc" },
    });
  },

  async findById(id: string): Promise<AdminTagRow | null> {
    return prisma.tag.findUnique({ where: { id }, select: adminTagSelect });
  },

  async findBySlug(slug: string): Promise<AdminTagRow | null> {
    return prisma.tag.findUnique({ where: { slug }, select: adminTagSelect });
  },

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.tag.findFirst({ where: { name }, select: { id: true } });
    return row !== null && row.id !== excludeId;
  },

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.tag.findUnique({ where: { slug }, select: { id: true } });
    return row !== null && row.id !== excludeId;
  },

  async findPublishedPostSlugs(tagId: string): Promise<string[]> {
    const rows = await prisma.postTag.findMany({
      where: { tagId, post: { status: "PUBLISHED" } },
      select: { post: { select: { slug: true } } },
    });
    return rows.map((row) => row.post.slug);
  },

  async create(data: { name: string; slug: string }): Promise<AdminTagRow> {
    try {
      return await prisma.tag.create({
        data: { name: data.name, slug: data.slug },
        select: adminTagSelect,
      });
    } catch (error) {
      mapTagUniqueConflict(error);
    }
  },

  async update(
    id: string,
    data: { name?: string; slug?: string },
    expectedVersion: number,
  ): Promise<AdminTagRow> {
    try {
      return await prisma.tag.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
        select: adminTagSelect,
      });
    } catch (error) {
      mapTagWriteError(error);
    }
  },

  async delete(id: string, expectedVersion: number): Promise<void> {
    try {
      await prisma.tag.delete({ where: { id, version: expectedVersion } });
    } catch (error) {
      mapTagWriteError(error);
    }
  },

  /** Verify every id exists; returns the matching slugs (used by post upserts). */
  async findSlugsByIds(ids: string[]): Promise<Map<string, string>> {
    const rows = await prisma.tag.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } });
    return new Map(rows.map((row) => [row.id, row.slug]));
  },
};
