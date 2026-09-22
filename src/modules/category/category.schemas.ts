import { z } from "zod";
import {
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_CATEGORY_SLUG_LENGTH,
} from "./category-policy";

const descriptionTransform = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** 手绘图标 key（dev/bulb/design/tool/plane/heart/coffee/leaf），非法值归一为 null。 */
const iconTransform = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-z][a-z-]{0,29}$/.test(trimmed) ? trimmed : null;
};

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME_LENGTH),
  slug: z.string().trim().toLowerCase().min(1).max(MAX_CATEGORY_SLUG_LENGTH),
  description: z
    .string()
    .trim()
    .max(MAX_CATEGORY_DESCRIPTION_LENGTH)
    .nullish()
    .transform(descriptionTransform),
  icon: z.string().trim().max(30).nullish().transform(iconTransform),
  sortOrder: z.number().int().min(0).max(1000),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  version: z.number().int().nonnegative().max(2_147_483_647),
});

// `z.input` — description is optional; sortOrder is required on create (omit → 422).
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
