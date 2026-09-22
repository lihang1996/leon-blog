import type { PostStatus } from "@/generated/prisma/client";

/**
 * Post DTOs (architecture §10.4). Public DTOs never leak internal ids, author
 * email, or any admin-only field. Admin DTOs omit the author relation.
 */

type TaxonomyRef = { name: string; slug: string };

export type PublicPostSummaryDTO = {
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  category: TaxonomyRef | null;
  tags: TaxonomyRef[];
};

export type PublicPostDetailDTO = PublicPostSummaryDTO & {
  contentMd: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  updatedAt: string;
  author: { displayName: string; avatarUrl: string | null };
};

export type AdminPostListItemDTO = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: PostStatus;
  coverImageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  tagIds: string[];
  publishedAt: string | null;
  updatedAt: string;
  version: number;
};

export type AdminPostDTO = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  coverImageUrl: string | null;
  status: PostStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  categoryId: string | null;
  tagIds: string[];
  /** Present on admin reads used by the preview page; write responses may omit. */
  category?: TaxonomyRef | null;
  tags?: TaxonomyRef[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency token; required on subsequent PATCH or DELETE. */
  version: number;
};
