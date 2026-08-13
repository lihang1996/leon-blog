import { isAcceptableSlug } from "@/lib/slug";

/**
 * Pure tag rules (architecture §7.5). No Next.js, no Prisma.
 */
export const MAX_TAG_NAME_LENGTH = 30;
export const MAX_TAG_SLUG_LENGTH = 50;

export type ValidationIssue = {
  code: string;
  message: string;
};

export function validateTagInput(input: { name: string; slug: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const name = input.name.trim();
  if (name.length < 1) {
    issues.push({ code: "TAG_NAME_EMPTY", message: "标签名称不能为空" });
  } else if (name.length > MAX_TAG_NAME_LENGTH) {
    issues.push({ code: "TAG_NAME_TOO_LONG", message: `标签名称不能超过 ${MAX_TAG_NAME_LENGTH} 个字符` });
  }

  const slug = input.slug.trim().toLowerCase();
  if (slug.length > MAX_TAG_SLUG_LENGTH) {
    issues.push({ code: "TAG_SLUG_TOO_LONG", message: `标签 slug 不能超过 ${MAX_TAG_SLUG_LENGTH} 个字符` });
  }
  if (!isAcceptableSlug(slug)) {
    issues.push({ code: "TAG_SLUG_INVALID", message: "标签 slug 格式不正确或使用了保留路径" });
  }

  return issues;
}
