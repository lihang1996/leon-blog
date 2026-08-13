import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isUniqueViolation, prisma, uniqueViolationField } from "@/lib/db/prisma";
import { ErrorCodes, conflict } from "@/lib/errors";

/** Map a P2002 on tags to a stable 409 (name vs slug) instead of a 500. */
function mapTagUniqueConflict(error: unknown): never {
  if (!isUniqueViolation(error)) throw error;
  const field = uniqueViolationField(error);
  if (field === "name") throw conflict(ErrorCodes.TAG_NAME_EXISTS, "标签名称已存在");
  throw conflict(ErrorCodes.TAG_SLUG_EXISTS, "标签 slug 已存在");
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
  _count: { select: { postTags: true } },
} satisfies Prisma.TagSelect;

export type PublicTagRow = Prisma.TagGetPayload<{ select: typeof publicTagSelect }>;
export type AdminTagRow = Prisma.TagGetPayload<{ select: typeof adminTagSelect }>;

export const tagRepository = {
  /** Public index: tags attached to at least one PUBLISHED post. */
  async findPublicTags(): Promise<PublicTagRow[]> {
    const rows = await prisma.tag.findMany({
      select: publicTagSelect,
      orderBy: { name: "asc" },
    });
    return rows.filter((row) => row._count.postTags > 0);
  },

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

  async update(id: string, data: { name?: string; slug?: string }): Promise<AdminTagRow> {
    try {
      return await prisma.tag.update({ where: { id }, data, select: adminTagSelect });
    } catch (error) {
      mapTagUniqueConflict(error);
    }
  },

  async delete(id: string): Promise<void> {
    await prisma.tag.delete({ where: { id } });
  },

  /** Verify every id exists; returns the matching slugs (used by post upserts). */
  async findSlugsByIds(ids: string[]): Promise<Map<string, string>> {
    const rows = await prisma.tag.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } });
    return new Map(rows.map((row) => [row.id, row.slug]));
  },
};
