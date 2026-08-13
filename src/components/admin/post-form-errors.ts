/**
 * Pure error-mapping for the post editor (UI spec §8.3). Kept separate from the
 * form component so the validation-failure path is unit-testable without a
 * browser — this is the exact path the reviewer flagged (details passthrough
 * must not crash when a business ValidationIssue has no `path`).
 */

export type ApiErrorDetail = { path?: string; code?: string; message: string };

export type ApiErrorShape = {
  code?: string;
  message?: string;
  details?: ApiErrorDetail[];
};

export type PostFormField =
  | "title"
  | "slug"
  | "excerpt"
  | "contentMd"
  | "tagIds"
  | "categoryId"
  | "coverImageUrl"
  | "seoTitle"
  | "seoDescription"
  | "seoImageUrl"
  | "global";

/**
 * Business-rule ValidationIssue codes (post-policy.ts) → editor fields. Zod
 * issues carry `path`; business issues carry only `code` (no `path`), so the
 * mapping below lets those surface next to the offending input.
 */
const BUSINESS_FIELD_MAP: Record<string, PostFormField> = {
  TITLE_EMPTY: "title",
  TITLE_TOO_LONG: "title",
  SLUG_EMPTY: "slug",
  SLUG_TOO_LONG: "slug",
  SLUG_FORMAT: "slug",
  SLUG_RESERVED: "slug",
  EXCERPT_EMPTY: "excerpt",
  EXCERPT_TOO_LONG: "excerpt",
  CONTENT_EMPTY: "contentMd",
  CONTENT_TOO_LARGE: "contentMd",
  TOO_MANY_TAGS: "tagIds",
  SEO_TITLE_TOO_LONG: "seoTitle",
  SEO_DESCRIPTION_TOO_LONG: "seoDescription",
  COVER_IMAGE_NOT_ALLOWED: "coverImageUrl",
  SEO_IMAGE_NOT_ALLOWED: "seoImageUrl",
};

const POST_FORM_FIELDS = new Set<PostFormField>([
  "title",
  "slug",
  "excerpt",
  "contentMd",
  "tagIds",
  "categoryId",
  "coverImageUrl",
  "seoTitle",
  "seoDescription",
  "seoImageUrl",
]);

/**
 * Map an API error's `details` onto field errors. Returns null when no detail
 * resolves to a field — callers then fall back to a global message. Never
 * throws, even for `{ code, message }` issues without a `path`.
 */
export function mapErrorToFields(details: ApiErrorDetail[] | undefined): Partial<Record<PostFormField, string>> {
  const next: Partial<Record<PostFormField, string>> = {};
  for (const issue of details ?? []) {
    const pathField =
      typeof issue.path === "string" && issue.path ? issue.path.split(".").pop() : undefined;
    const key =
      pathField && POST_FORM_FIELDS.has(pathField as PostFormField)
        ? (pathField as PostFormField)
        : issue.code
          ? BUSINESS_FIELD_MAP[issue.code]
          : undefined;
    if (key) next[key] = issue.message;
  }
  return next;
}
