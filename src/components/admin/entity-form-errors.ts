export type EntityFormErrors = Partial<Record<"name" | "slug" | "description" | "sortOrder" | "global", string>>;

export type EntityApiError = {
  code?: string;
  message?: string;
  details?: Array<{ path?: string; code?: string; message: string }>;
};

const CATEGORY_CODE_FIELDS: Record<string, keyof EntityFormErrors> = {
  CATEGORY_NAME_EMPTY: "name",
  CATEGORY_NAME_TOO_LONG: "name",
  CATEGORY_NAME_EXISTS: "name",
  CATEGORY_SLUG_TOO_LONG: "slug",
  CATEGORY_SLUG_INVALID: "slug",
  CATEGORY_SLUG_EXISTS: "slug",
  CATEGORY_DESCRIPTION_TOO_LONG: "description",
  CATEGORY_NOT_FOUND: "global",
};

const TAG_CODE_FIELDS: Record<string, keyof EntityFormErrors> = {
  TAG_NAME_EMPTY: "name",
  TAG_NAME_TOO_LONG: "name",
  TAG_NAME_EXISTS: "name",
  TAG_SLUG_TOO_LONG: "slug",
  TAG_SLUG_INVALID: "slug",
  TAG_SLUG_EXISTS: "slug",
  TAG_NOT_FOUND: "global",
};

function mapEntityError(
  error: EntityApiError,
  allowedFields: ReadonlySet<string>,
  codeFields: Readonly<Record<string, keyof EntityFormErrors>>,
): EntityFormErrors {
  const next: EntityFormErrors = {};

  for (const issue of error.details ?? []) {
    const pathField = typeof issue.path === "string" ? issue.path.split(".").pop() : undefined;
    const field = pathField && allowedFields.has(pathField) ? pathField : issue.code ? codeFields[issue.code] : undefined;
    if (field) next[field as keyof EntityFormErrors] = issue.message;
  }

  const topLevelField = error.code ? codeFields[error.code] : undefined;
  if (topLevelField && !next[topLevelField]) next[topLevelField] = error.message ?? "输入内容已存在";
  if (Object.keys(next).length === 0) next.global = error.message ?? "保存失败";
  return next;
}

export function mapCategoryFormError(error: EntityApiError): EntityFormErrors {
  return mapEntityError(error, new Set(["name", "slug", "description", "sortOrder"]), CATEGORY_CODE_FIELDS);
}

export function mapTagFormError(error: EntityApiError): EntityFormErrors {
  return mapEntityError(error, new Set(["name", "slug"]), TAG_CODE_FIELDS);
}
