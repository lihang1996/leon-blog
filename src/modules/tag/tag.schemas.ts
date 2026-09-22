import { z } from "zod";
import { MAX_TAG_NAME_LENGTH, MAX_TAG_SLUG_LENGTH } from "./tag-policy";

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(MAX_TAG_NAME_LENGTH),
  slug: z.string().trim().toLowerCase().min(1).max(MAX_TAG_SLUG_LENGTH),
});

export const updateTagSchema = createTagSchema.partial().extend({
  version: z.number().int().nonnegative().max(2_147_483_647),
});

export type CreateTagInput = z.input<typeof createTagSchema>;
export type UpdateTagInput = z.input<typeof updateTagSchema>;
