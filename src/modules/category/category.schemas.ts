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

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME_LENGTH),
  slug: z.string().trim().toLowerCase().min(1).max(MAX_CATEGORY_SLUG_LENGTH),
  description: z
    .string()
    .trim()
    .max(MAX_CATEGORY_DESCRIPTION_LENGTH)
    .nullish()
    .transform(descriptionTransform),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

// `z.input` — description/sortOrder are optional at the call site (zod defaults).
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
