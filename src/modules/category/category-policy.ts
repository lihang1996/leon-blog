import { isAcceptableSlug } from "@/lib/slug";

/**
 * Pure category rules (architecture §7.5). No Next.js, no Prisma.
 */
export const MAX_CATEGORY_NAME_LENGTH = 40;
export const MAX_CATEGORY_SLUG_LENGTH = 60;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 200;

export type ValidationIssue = {
  code: string;
  message: string;
};

export function validateCategoryInput(input: {
  name: string;
  slug: string;
  description: string | null;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const name = input.name.trim();
  if (name.length < 1) {
    issues.push({ code: "CATEGORY_NAME_EMPTY", message: "分类名称不能为空" });
  } else if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    issues.push({ code: "CATEGORY_NAME_TOO_LONG", message: `分类名称不能超过 ${MAX_CATEGORY_NAME_LENGTH} 个字符` });
  }

  const slug = input.slug.trim().toLowerCase();
  if (slug.length > MAX_CATEGORY_SLUG_LENGTH) {
    issues.push({ code: "CATEGORY_SLUG_TOO_LONG", message: `分类 slug 不能超过 ${MAX_CATEGORY_SLUG_LENGTH} 个字符` });
  }
  if (!isAcceptableSlug(slug)) {
    issues.push({ code: "CATEGORY_SLUG_INVALID", message: "分类 slug 格式不正确或使用了保留路径" });
  }

  if (input.description && input.description.length > MAX_CATEGORY_DESCRIPTION_LENGTH) {
    issues.push({ code: "CATEGORY_DESCRIPTION_TOO_LONG", message: `分类说明不能超过 ${MAX_CATEGORY_DESCRIPTION_LENGTH} 个字符` });
  }

  return issues;
}
