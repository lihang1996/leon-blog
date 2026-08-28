import { describe, expect, it } from "vitest";
import { createCategorySchema } from "@/modules/category/category.schemas";
import { isPageOutOfRange } from "@/lib/pagination";

describe("createCategorySchema sortOrder", () => {
  it("requires sortOrder and keeps a submitted 7", () => {
    const parsed = createCategorySchema.parse({ name: "前端", slug: "frontend", sortOrder: 7 });
    expect(parsed.sortOrder).toBe(7);
  });

  it("rejects an omitted sortOrder instead of defaulting to 0", () => {
    const result = createCategorySchema.safeParse({ name: "前端", slug: "frontend" });
    expect(result.success).toBe(false);
  });

  it("rejects sortOrder outside 0–1000", () => {
    expect(createCategorySchema.safeParse({ name: "前端", slug: "frontend", sortOrder: -1 }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "前端", slug: "frontend", sortOrder: 1001 }).success).toBe(false);
  });
});

describe("pagination range", () => {
  it("does not treat an empty collection page 1 as out of range", () => {
    expect(isPageOutOfRange(1, 1)).toBe(false);
    expect(isPageOutOfRange(999, 3)).toBe(true);
  });
});
