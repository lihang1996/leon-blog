/**
 * FR-07 field-level validation for the post editor.
 *
 * The server stays the FINAL validator; these helpers only (a) give instant
 * Chinese field errors with the SAME limits the server enforces, and (b) map
 * server rejections (zod `details[].path`, policy `details[].code`, business
 * codes, 413) back onto editor fields so the user can fix the right input.
 * Limits mirror `src/modules/post/post-policy.ts` on purpose.
 */

import { isAcceptableSlug, isValidSlug } from "@/lib/slug";
import {
  MAX_CONTENT_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TAGS_PER_POST,
  MAX_TITLE_LENGTH,
} from "@/modules/post/post-policy";
import type { EditorDraft, MutationFailure } from "./editor-state";

export type EditorField =
  | "title"
  | "excerpt"
  | "contentMd"
  | "slug"
  | "categoryId"
  | "tagIds"
  | "seoTitle"
  | "seoDescription"
  | "coverImageUrl"
  | "seoImageUrl";

export type FieldErrors = Partial<Record<EditorField, string>>;

export const EDITOR_FIELD_LABELS: Record<EditorField, string> = {
  title: "标题",
  excerpt: "摘要",
  contentMd: "正文",
  slug: "Slug",
  categoryId: "分类",
  tagIds: "标签",
  seoTitle: "SEO 标题",
  seoDescription: "SEO 描述",
  coverImageUrl: "封面图片 URL",
  seoImageUrl: "分享图片 URL",
};

/** The order in which the first correctable field is focused. */
export const EDITOR_FIELD_ORDER: readonly EditorField[] = [
  "title", "excerpt", "contentMd", "slug", "categoryId", "tagIds",
  "seoTitle", "seoDescription", "coverImageUrl", "seoImageUrl",
];

export const EDITOR_LIMITS = {
  title: MAX_TITLE_LENGTH,
  excerpt: MAX_EXCERPT_LENGTH,
  contentMd: MAX_CONTENT_LENGTH,
  slug: MAX_SLUG_LENGTH,
  seoTitle: MAX_SEO_TITLE_LENGTH,
  seoDescription: MAX_SEO_DESCRIPTION_LENGTH,
  imageUrl: 2048,
  tags: MAX_TAGS_PER_POST,
} as const;

/** Fields rendered inside the collapsible SEO section. */
export const SEO_EDITOR_FIELDS: readonly EditorField[] = ["seoTitle", "seoDescription", "coverImageUrl", "seoImageUrl"];

/**
 * Focusable input id per field (FR-07.3). Field names are camelCase while the
 * form's input ids are hyphenated — this explicit map keeps the focus effect
 * from querying a non-existent id (`editor-seoTitle`) and silently skipping
 * focus. Fields without a single focusable input (tag chips, category select
 * is covered, tagIds has none) are omitted.
 */
export const EDITOR_FIELD_INPUT_IDS: Partial<Record<EditorField, string>> = {
  title: "editor-title",
  excerpt: "editor-excerpt",
  contentMd: "editor-content",
  slug: "editor-slug",
  categoryId: "editor-category",
  seoTitle: "editor-seo-title",
  seoDescription: "editor-seo-description",
  coverImageUrl: "editor-cover-url",
  seoImageUrl: "editor-share-url",
};

/** Input id for the first focusable errored field, or null (none/tagIds). */
export function editorFieldInputId(field: EditorField): string | null {
  return EDITOR_FIELD_INPUT_IDS[field] ?? null;
}

export function seoSectionNeedsExpand(fieldErrors: FieldErrors): boolean {
  return SEO_EDITOR_FIELDS.some((field) => fieldErrors[field]);
}

/** First field (in UI order) whose error should receive focus. */
export function firstErroredField(fieldErrors: FieldErrors): EditorField | null {
  for (const field of EDITOR_FIELD_ORDER) {
    if (fieldErrors[field]) return field;
  }
  return null;
}

/**
 * Client-side pre-check with the server's own limits. Counts use JavaScript
 * string length on the TRIMMED value — exactly what the server's
 * `.trim().max(n)` measures — so 120 submits and 121 fails here too.
 */
export function validateEditorDraft(
  draft: EditorDraft,
  options: { slugLocked: boolean },
): FieldErrors {
  const errors: FieldErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "请填写标题";
  else if (title.length > EDITOR_LIMITS.title) {
    errors.title = `标题不能超过 ${EDITOR_LIMITS.title} 个字符（当前 ${title.length} 个），请删减后再保存`;
  }

  const excerpt = draft.excerpt.trim();
  if (!excerpt) errors.excerpt = "请填写摘要";
  else if (excerpt.length > EDITOR_LIMITS.excerpt) {
    errors.excerpt = `摘要不能超过 ${EDITOR_LIMITS.excerpt} 个字符（当前 ${excerpt.length} 个），请删减后再保存`;
  }

  const content = draft.contentMd.trim();
  if (!content) errors.contentMd = "请填写正文";
  else if (draft.contentMd.length > EDITOR_LIMITS.contentMd) {
    errors.contentMd = `正文不能超过 ${EDITOR_LIMITS.contentMd} 个字符（当前 ${draft.contentMd.length} 个），请拆分或删减后再保存`;
  }

  if (!options.slugLocked) {
    const slug = draft.slug.trim();
    if (slug) {
      if (slug.length > EDITOR_LIMITS.slug) {
        errors.slug = `Slug 不能超过 ${EDITOR_LIMITS.slug} 个字符`;
      } else if (!isValidSlug(slug)) {
        errors.slug = "Slug 只能包含小写字母、数字与连字符，且不能以连字符开头或结尾";
      } else if (!isAcceptableSlug(slug)) {
        errors.slug = "该 Slug 与系统保留路径冲突，请更换";
      }
    }
  }

  if (draft.tagIds.length > EDITOR_LIMITS.tags) {
    errors.tagIds = `一篇文章最多选择 ${EDITOR_LIMITS.tags} 个标签（当前 ${draft.tagIds.length} 个）`;
  }

  const seoTitle = draft.seoTitle.trim();
  if (seoTitle.length > EDITOR_LIMITS.seoTitle) {
    errors.seoTitle = `SEO 标题不能超过 ${EDITOR_LIMITS.seoTitle} 个字符（当前 ${seoTitle.length} 个）`;
  }
  const seoDescription = draft.seoDescription.trim();
  if (seoDescription.length > EDITOR_LIMITS.seoDescription) {
    errors.seoDescription = `SEO 描述不能超过 ${EDITOR_LIMITS.seoDescription} 个字符（当前 ${seoDescription.length} 个）`;
  }
  for (const [field, value] of [["coverImageUrl", draft.coverImageUrl], ["seoImageUrl", draft.seoImageUrl]] as const) {
    const url = value.trim();
    if (url.length > EDITOR_LIMITS.imageUrl) {
      errors[field] = "图片地址不能超过 2048 个字符";
    } else if (url && !url.startsWith("/") && !url.startsWith("https://")) {
      errors[field] = "图片地址必须是站内路径（以 / 开头）或 https:// 开头的 HTTPS 地址";
    }
  }
  return errors;
}

/** Strips the PATCH wrapper so `content.title` and `title` land on the same field. */
function zodPathToField(path: string): EditorField | null {
  const normalized = path.replace(/^content\./, "").split(".")[0] as EditorField;
  return normalized in EDITOR_FIELD_LABELS ? normalized : null;
}

/** Server policy issues carry stable codes (`TITLE_TOO_LONG`, `SLUG_FORMAT`, …). */
function policyCodeToField(code: string): EditorField | null {
  if (code.startsWith("TITLE_")) return "title";
  if (code.startsWith("EXCERPT_")) return "excerpt";
  if (code.startsWith("CONTENT_") || code.startsWith("MARKDOWN_")) return "contentMd";
  if (code.startsWith("SLUG_")) return "slug";
  if (code.startsWith("TOO_MANY_TAGS")) return "tagIds";
  if (code.startsWith("SEO_TITLE_")) return "seoTitle";
  if (code.startsWith("SEO_DESCRIPTION_")) return "seoDescription";
  if (code.startsWith("COVER_IMAGE_")) return "coverImageUrl";
  if (code.startsWith("SEO_IMAGE_")) return "seoImageUrl";
  return null;
}

/** Business error codes that identify one specific field. */
const BUSINESS_CODE_FIELDS: Record<string, EditorField> = {
  POST_SLUG_EXISTS: "slug",
};

export interface ServerErrorMapping {
  fieldErrors: FieldErrors;
  /** Form-level lines that belong to no single field (never dropped). */
  summary: string[];
}

/**
 * Maps a failed write's `details` / code onto fields. Handles zod issues
 * (`{path,message}` — create paths like `title` AND update paths like
 * `content.title`), policy issues (`{code,message}`), business codes, and the
 * 413 body-too-large case. Anything unrecognized lands in the summary so it
 * can never silently disappear (FR-07.6).
 */
export function mapMutationFailureToFields(failure: MutationFailure & { details?: unknown }): ServerErrorMapping {
  const fieldErrors: FieldErrors = {};
  const summary: string[] = [];

  if (failure.status === 413) {
    fieldErrors.contentMd = "请求体过大（413）：正文或整体内容超出服务器单次请求上限，请精简后重试";
    return { fieldErrors, summary };
  }

  if (Array.isArray(failure.details)) {
    for (const item of failure.details) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as { path?: unknown; code?: unknown; message?: unknown };
      const message = typeof entry.message === "string" && entry.message.trim() ? entry.message.trim() : "";
      if (typeof entry.path === "string" && entry.path) {
        const field = zodPathToField(entry.path);
        if (field) fieldErrors[field] = fieldErrors[field] ?? message;
        else summary.push(entry.path ? `${entry.path}：${message}` : message);
      } else if (typeof entry.code === "string" && entry.code) {
        const field = policyCodeToField(entry.code);
        if (field) fieldErrors[field] = fieldErrors[field] ?? message;
        else summary.push(message || entry.code);
      } else {
        summary.push(message);
      }
    }
  }

  if (failure.errorCode) {
    const businessField = BUSINESS_CODE_FIELDS[failure.errorCode];
    if (businessField && !fieldErrors[businessField]) {
      fieldErrors[businessField] = friendlyBusinessMessage(failure.errorCode, failure.error);
    }
  }
  return { fieldErrors, summary };
}

function friendlyBusinessMessage(code: string, fallback: string | null): string {
  if (code === "POST_SLUG_EXISTS") return "该 Slug 已被其他文章使用，请更换";
  return fallback || "该字段未通过服务器校验";
}
