import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { validateCategoryInput } from "./category-policy";
import {
  categoryRepository,
  type AdminCategoryRow,
  type PublicCategoryRow,
} from "./category.repository";
import {
  type AdminCategoryDTO,
  type PublicCategoryDTO,
} from "./category.dto";
import type { CreateCategoryInput, UpdateCategoryInput } from "./category.schemas";
import { CACHE_TAGS } from "@/lib/cache/cache-invalidation";
import { ErrorCodes, conflict, notFound, unprocessable } from "@/lib/errors";

/**
 * Category application service (architecture §4.2). Applies the pure policy
 * rules, then reads/writes through the repository. Write methods return a
 * change set so the Route Handler can invalidate cache only after the commit.
 */

export type CategoryChangeSet = {
  oldSlug: string | null;
  newSlug: string;
  affectedPostSlugs: string[];
};

function toPublicDTO(row: PublicCategoryRow): PublicCategoryDTO {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    postCount: row._count.posts,
  };
}

function toAdminDTO(row: AdminCategoryRow): AdminCategoryDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    postCount: row._count.posts,
  };
}

function validate(input: { name: string; slug: string; description: string | null }): void {
  const issues = validateCategoryInput(input);
  if (issues.length > 0) {
    throw unprocessable(ErrorCodes.VALIDATION_FAILED, issues[0]!.message, issues);
  }
}

async function listPublicCategoriesCached(): Promise<PublicCategoryDTO[]> {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.categories);
  const rows = await categoryRepository.findPublicCategories();
  return rows.map(toPublicDTO);
}

async function getPublicCategoryBySlugCached(slug: string): Promise<PublicCategoryDTO | null> {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.category(slug));
  const row = await categoryRepository.findPublicBySlug(slug);
  return row ? toPublicDTO(row) : null;
}

export const categoryService = {
  // ---- Queries -----------------------------------------------------------

  listPublicCategories: listPublicCategoriesCached,
  getPublicCategoryBySlug: getPublicCategoryBySlugCached,

  async listAdminCategories(): Promise<AdminCategoryDTO[]> {
    const rows = await categoryRepository.listAdminCategories();
    return rows.map(toAdminDTO);
  },

  async getAdminCategory(id: string): Promise<AdminCategoryDTO> {
    const row = await categoryRepository.findById(id);
    if (!row) throw notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在");
    return toAdminDTO(row);
  },

  // ---- Commands ----------------------------------------------------------

  async createCategory(input: CreateCategoryInput): Promise<{
    category: AdminCategoryDTO;
    changeSet: CategoryChangeSet;
  }> {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const description = input.description ?? null;
    validate({ name, slug, description });

    if (await categoryRepository.nameExists(name)) {
      throw conflict(ErrorCodes.CATEGORY_NAME_EXISTS, "分类名称已存在");
    }
    if (await categoryRepository.slugExists(slug)) {
      throw conflict(ErrorCodes.CATEGORY_SLUG_EXISTS, "分类 slug 已存在");
    }

    const row = await categoryRepository.create({
      name,
      slug,
      description,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
    });
    return { category: toAdminDTO(row), changeSet: { oldSlug: null, newSlug: slug, affectedPostSlugs: [] } };
  },

  async updateCategory(
    id: string,
    input: UpdateCategoryInput,
  ): Promise<{ category: AdminCategoryDTO; changeSet: CategoryChangeSet }> {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在");

    const name = (input.name ?? existing.name).trim();
    const slug = (input.slug ?? existing.slug).trim().toLowerCase();
    const description = input.description !== undefined ? input.description : existing.description;
    validate({ name, slug, description });

    if (await categoryRepository.nameExists(name, id)) {
      throw conflict(ErrorCodes.CATEGORY_NAME_EXISTS, "分类名称已存在");
    }
    if (await categoryRepository.slugExists(slug, id)) {
      throw conflict(ErrorCodes.CATEGORY_SLUG_EXISTS, "分类 slug 已存在");
    }

    const affectedPostSlugs = await categoryRepository.findPublishedPostSlugs(id);
    const row = await categoryRepository.update(id, {
      name,
      slug,
      description,
      icon: input.icon !== undefined ? input.icon : undefined,
      sortOrder: input.sortOrder,
    });
    return {
      category: toAdminDTO(row),
      changeSet: { oldSlug: existing.slug, newSlug: slug, affectedPostSlugs },
    };
  },

  /**
   * Deleting a category keeps its posts (onDelete: SetNull) — PRD B-12.
   * The caller surfaces the impact range via the returned affectedPostCount
   * (the UI shows a confirm dialog before calling).
   */
  async deleteCategory(id: string): Promise<{
    changeSet: CategoryChangeSet;
    affectedPostCount: number;
  }> {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在");
    const affectedPostSlugs = await categoryRepository.findPublishedPostSlugs(id);
    await categoryRepository.delete(id);
    return {
      changeSet: { oldSlug: existing.slug, newSlug: existing.slug, affectedPostSlugs },
      affectedPostCount: existing._count.posts,
    };
  },
};
