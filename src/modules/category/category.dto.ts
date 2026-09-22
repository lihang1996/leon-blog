/**
 * Category DTOs — the only shapes allowed to cross the API/page boundary.
 * Prisma Category models must never be serialized directly (architecture §10.4).
 */

export type PublicCategoryDTO = {
  name: string;
  slug: string;
  description: string | null;
  /** 手绘图标 key（dev/bulb/...），可空。 */
  icon: string | null;
  /** Number of PUBLISHED posts in this category. */
  postCount: number;
};

export type AdminCategoryDTO = {
  id: string;
  version: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  /** Total posts (any status) — shown in the admin confirm dialog. */
  postCount: number;
};
