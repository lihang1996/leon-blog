import { isAcceptableSlug, isValidSlug, slugifyTitle } from "@/lib/slug";
import { extractMarkdownImageUrls } from "@/lib/markdown/markdown-policy";

/**
 * Pure post rules (architecture §7). No Next.js, no Prisma.
 * State machine, publish validation, slug rules, deletion rules.
 */
export const POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const MAX_TITLE_LENGTH = 120;
export const MAX_EXCERPT_LENGTH = 300;
export const MAX_SLUG_LENGTH = 160;
export const MAX_SEO_TITLE_LENGTH = 60;
export const MAX_SEO_DESCRIPTION_LENGTH = 160;
export const MAX_TAGS_PER_POST = 10;
export const MAX_CONTENT_LENGTH = 200 * 1024; // 200 KB

export function isPostStatus(value: string): value is PostStatus {
  return (POST_STATUSES as readonly string[]).includes(value);
}

// ---- State machine (architecture §7.2) -----------------------------------

const TRANSITIONS: Record<PostStatus, ReadonlySet<PostStatus>> = {
  DRAFT: new Set(["PUBLISHED"]),
  PUBLISHED: new Set(["ARCHIVED"]),
  ARCHIVED: new Set(["DRAFT"]),
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return TRANSITIONS[from]?.has(to) ?? false;
}

/** Only drafts can be hard-deleted (architecture §7.2). */
export function canHardDelete(status: PostStatus): boolean {
  return status === "DRAFT";
}

// ---- Validation issue shape ----------------------------------------------

export type ValidationIssue = {
  code: string;
  message: string;
};

// ---- Slug rules (architecture §7.4) ---------------------------------------

export function isSlugEditable(publishedAt: Date | null): boolean {
  return publishedAt === null;
}

export function generateSlug(title: string): string {
  return slugifyTitle(title);
}

export function validateSlug(slug: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!slug.trim()) {
    issues.push({ code: "SLUG_EMPTY", message: "slug 不能为空" });
  } else {
    if (slug.length > MAX_SLUG_LENGTH) {
      issues.push({ code: "SLUG_TOO_LONG", message: `slug 不能超过 ${MAX_SLUG_LENGTH} 个字符` });
    }
    if (!isValidSlug(slug)) {
      issues.push({
        code: "SLUG_FORMAT",
        message: "slug 只能包含小写字母、数字与连字符，且不能以连字符开头或结尾",
      });
    }
    if (!isAcceptableSlug(slug)) {
      issues.push({ code: "SLUG_RESERVED", message: "slug 使用了系统保留路径" });
    }
  }
  return issues;
}

// ---- Publish validation (architecture §7.3) -------------------------------

export type PublishCheckInput = {
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  tagCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  coverImageUrl: string | null;
  seoImageUrl: string | null;
  isAuthorActive: boolean;
  isImageUrlAllowed: (url: string) => boolean;
};

export function validatePublish(input: PublishCheckInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const title = input.title.trim();
  if (title.length < 1) {
    issues.push({ code: "TITLE_EMPTY", message: "标题不能为空" });
  } else if (title.length > MAX_TITLE_LENGTH) {
    issues.push({ code: "TITLE_TOO_LONG", message: `标题不能超过 ${MAX_TITLE_LENGTH} 个字符` });
  }

  issues.push(...validateSlug(input.slug));

  const excerpt = input.excerpt.trim();
  if (excerpt.length < 1) {
    issues.push({ code: "EXCERPT_EMPTY", message: "摘要不能为空" });
  } else if (excerpt.length > MAX_EXCERPT_LENGTH) {
    issues.push({ code: "EXCERPT_TOO_LONG", message: `摘要不能超过 ${MAX_EXCERPT_LENGTH} 个字符` });
  }

  if (!input.contentMd.trim()) {
    issues.push({ code: "CONTENT_EMPTY", message: "正文不能为空" });
  } else if (input.contentMd.length > MAX_CONTENT_LENGTH) {
    issues.push({ code: "CONTENT_TOO_LARGE", message: `正文不能超过 ${MAX_CONTENT_LENGTH} 字节` });
  } else {
    // Use exactly the renderer's image grammar; code/examples are not images.
    // One scan and at most one issue, with no separate relative-URL bypass.
    for (const imageUrl of extractMarkdownImageUrls(input.contentMd)) {
      if (!input.isImageUrlAllowed(imageUrl)) {
        issues.push({ code: "MARKDOWN_IMAGE_NOT_ALLOWED", message: "正文图片必须是站内地址或白名单内的 HTTPS 地址" });
        break;
      }
    }
  }

  if (input.tagCount > MAX_TAGS_PER_POST) {
    issues.push({ code: "TOO_MANY_TAGS", message: `标签不能超过 ${MAX_TAGS_PER_POST} 个` });
  }

  if (input.seoTitle && input.seoTitle.length > MAX_SEO_TITLE_LENGTH) {
    issues.push({ code: "SEO_TITLE_TOO_LONG", message: `SEO 标题不能超过 ${MAX_SEO_TITLE_LENGTH} 个字符` });
  }

  if (input.seoDescription && input.seoDescription.length > MAX_SEO_DESCRIPTION_LENGTH) {
    issues.push({
      code: "SEO_DESCRIPTION_TOO_LONG",
      message: `SEO 描述不能超过 ${MAX_SEO_DESCRIPTION_LENGTH} 个字符`,
    });
  }

  if (input.coverImageUrl && !input.isImageUrlAllowed(input.coverImageUrl)) {
    issues.push({ code: "COVER_IMAGE_NOT_ALLOWED", message: "封面图片必须是白名单内的 HTTPS 地址" });
  }

  if (input.seoImageUrl && !input.isImageUrlAllowed(input.seoImageUrl)) {
    issues.push({ code: "SEO_IMAGE_NOT_ALLOWED", message: "分享图片必须是白名单内的 HTTPS 地址" });
  }

  if (!input.isAuthorActive) {
    issues.push({ code: "AUTHOR_INACTIVE", message: "作者账号已停用，无法发布" });
  }

  return issues;
}

export function isPublishable(input: PublishCheckInput): boolean {
  return validatePublish(input).length === 0;
}
