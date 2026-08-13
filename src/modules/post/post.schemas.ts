import { z } from "zod";
import {
  MAX_CONTENT_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TAGS_PER_POST,
  MAX_TITLE_LENGTH,
} from "./post-policy";

/**
 * Admin post input schemas (architecture §10.6). Zod handles shape/type and
 * length; domain rules (slug format/reserved, image allowlist, publish
 * readiness, transitions) live in the policy + command service.
 */

const optionalStringToNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(optionalStringToNull);

const contentFields = {
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  excerpt: z.string().trim().min(1).max(MAX_EXCERPT_LENGTH),
  contentMd: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
  slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(MAX_TAGS_PER_POST).default([]),
  coverImageUrl: nullableText(2048),
  seoTitle: nullableText(MAX_SEO_TITLE_LENGTH),
  seoDescription: nullableText(MAX_SEO_DESCRIPTION_LENGTH),
  seoImageUrl: nullableText(2048),
} as const;

export const createPostSchema = z.object(contentFields);

/** PATCH body: any combination of content fields plus an optional status action. */
export const updatePostSchema = z
  .object({
    content: z.object(contentFields).partial().optional(),
    action: z.enum(["publish", "archive", "restore"]).optional(),
  })
  .refine((value) => value.content !== undefined || value.action !== undefined, {
    message: "至少需要提供内容字段或状态操作",
  });

export const postStatusQuerySchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "ALL"]).default("ALL"),
});

// `z.input` = the shape callers actually provide (optional SEO fields, tagIds
// defaulted by zod). The services normalize internally.
export type CreatePostInput = z.input<typeof createPostSchema>;
export type PostContentUpdate = NonNullable<z.input<typeof updatePostSchema>["content"]>;
export type PostStatusAction = NonNullable<z.input<typeof updatePostSchema>["action"]>;
