import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isNotFoundViolation, isUniqueViolation, prisma, uniqueViolationField } from "@/lib/db/prisma";
import { AppError, ErrorCodes, conflict } from "@/lib/errors";

/** Map a P2002 on categories to a stable 409 (name vs slug) instead of a 500. */
function mapCategoryUniqueConflict(error: unknown): never {
  if (!isUniqueViolation(error)) throw error;
  const field = uniqueViolationField(error);
  if (field === "name") throw conflict(ErrorCodes.CATEGORY_NAME_EXISTS, "分类名称已存在");
  throw conflict(ErrorCodes.CATEGORY_SLUG_EXISTS, "分类 slug 已存在");
}

function mapCategoryWriteError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (isUniqueViolation(error)) mapCategoryUniqueConflict(error);
  if (isNotFoundViolation(error)) {
    throw conflict(ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, "分类已被其他操作修改，请刷新后重试");
  }
  throw error;
}

/**
 * Category data access (architecture §4.4). Encapsulates Prisma, controls
 * field selection and avoids N+1 (counts come from _count, posts loaded in
 * one query).
 */

/** Counts only PUBLISHED posts (public semantics). */
const publishedPostCount = {
  posts: { where: { status: "PUBLISHED" as const } },
} satisfies Prisma.CategoryCountOutputTypeSelect;

export const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
  _count: { select: publishedPostCount },
} satisfies Prisma.CategorySelect;

export const adminCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
  sortOrder: true,
  updatedAt: true,
  version: true,
  _count: { select: { posts: true } },
} satisfies Prisma.CategorySelect;

export type PublicCategoryRow = Prisma.CategoryGetPayload<{ select: typeof publicCategorySelect }>;
export type AdminCategoryRow = Prisma.CategoryGetPayload<{ select: typeof adminCategorySelect }>;

export const categoryRepository = {
  /** Public index: categories that have at least one PUBLISHED post. */
  async findPublicCategories(): Promise<PublicCategoryRow[]> {
    const rows = await prisma.category.findMany({
      select: publicCategorySelect,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.filter((row) => row._count.posts > 0);
  },

  /** Public detail by slug — exists even when it currently has zero published posts. */
  async findPublicBySlug(slug: string): Promise<PublicCategoryRow | null> {
    return prisma.category.findFirst({
      where: { slug },
      select: publicCategorySelect,
    });
  },

  async listAdminCategories(): Promise<AdminCategoryRow[]> {
    return prisma.category.findMany({
      select: adminCategorySelect,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  async findById(id: string): Promise<AdminCategoryRow | null> {
    return prisma.category.findUnique({
      where: { id },
      select: adminCategorySelect,
    });
  },

  async findBySlug(slug: string): Promise<AdminCategoryRow | null> {
    return prisma.category.findUnique({
      where: { slug },
      select: adminCategorySelect,
    });
  },

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.category.findFirst({ where: { name }, select: { id: true } });
    return row !== null && row.id !== excludeId;
  },

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    return row !== null && row.id !== excludeId;
  },

  /** Slugs of PUBLISHED posts in this category (cache invalidation on change). */
  async findPublishedPostSlugs(categoryId: string): Promise<string[]> {
    const rows = await prisma.post.findMany({
      where: { categoryId, status: "PUBLISHED" },
      select: { slug: true },
    });
    return rows.map((row) => row.slug);
  },

  async create(data: {
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    sortOrder: number;
  }): Promise<AdminCategoryRow> {
    try {
      return await prisma.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          icon: data.icon,
          sortOrder: data.sortOrder,
        },
        select: adminCategorySelect,
      });
    } catch (error) {
      mapCategoryUniqueConflict(error);
    }
  },

  async update(
    id: string,
    data: { name?: string; slug?: string; description?: string | null; icon?: string | null; sortOrder?: number },
    expectedVersion: number,
  ): Promise<AdminCategoryRow> {
    try {
      return await prisma.category.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
        select: adminCategorySelect,
      });
    } catch (error) {
      mapCategoryWriteError(error);
    }
  },

  async delete(id: string, expectedVersion: number): Promise<void> {
    try {
      await prisma.category.delete({ where: { id, version: expectedVersion } });
    } catch (error) {
      mapCategoryWriteError(error);
    }
  },
};
