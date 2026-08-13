import { describe, expect, it, vi } from "vitest";
import {
  buildInvalidationPlan,
  buildCategoryInvalidationPlan,
  buildTagInvalidationPlan,
  applyInvalidationPlan,
  type PostChangeSet,
} from "@/lib/cache/cache-invalidation";

describe("buildInvalidationPlan", () => {
  const base: PostChangeSet = {
    oldSlug: null,
    newSlug: "hello-world",
    oldCategorySlug: null,
    newCategorySlug: null,
    oldTagSlugs: [],
    newTagSlugs: [],
  };

  it("always invalidates home and the post list when a post changes", () => {
    const plan = buildInvalidationPlan(base);
    expect(plan.paths).toContain("/");
    expect(plan.paths).toContain("/posts");
    expect(plan.tags).toContain("posts");
  });

  it("covers old and new post slugs", () => {
    const plan = buildInvalidationPlan({ ...base, oldSlug: "old-slug" });
    expect(plan.paths).toContain("/posts/old-slug");
    expect(plan.paths).toContain("/posts/hello-world");
    expect(plan.tags).toContain("post:old-slug");
    expect(plan.tags).toContain("post:hello-world");
  });

  it("invalidates category index + old/new category paths and tags", () => {
    const plan = buildInvalidationPlan({
      ...base,
      oldCategorySlug: "old-cat",
      newCategorySlug: "new-cat",
    });
    expect(plan.paths).toContain("/categories");
    expect(plan.paths).toContain("/categories/old-cat");
    expect(plan.paths).toContain("/categories/new-cat");
    expect(plan.tags).toContain("categories");
    expect(plan.tags).toContain("category:old-cat");
    expect(plan.tags).toContain("category:new-cat");
  });

  it("invalidates tag index + union of old/new tag paths", () => {
    const plan = buildInvalidationPlan({
      ...base,
      oldTagSlugs: ["a", "b"],
      newTagSlugs: ["b", "c"],
    });
    expect(plan.paths).toContain("/tags");
    expect(plan.paths).toContain("/tags/a");
    expect(plan.paths).toContain("/tags/b");
    expect(plan.paths).toContain("/tags/c");
    expect(plan.tags).toContain("tags");
    expect(plan.tags).toContain("tag:a");
    expect(plan.tags).toContain("tag:b");
    expect(plan.tags).toContain("tag:c");
  });

  it("dedupes paths and tags", () => {
    const plan = buildInvalidationPlan({
      oldSlug: "same",
      newSlug: "same",
      oldCategorySlug: null,
      newCategorySlug: null,
      oldTagSlugs: ["x"],
      newTagSlugs: ["x"],
    });
    expect(new Set(plan.paths).size).toBe(plan.paths.length);
    expect(new Set(plan.tags).size).toBe(plan.tags.length);
  });
});

describe("category/tag plans", () => {
  it("extends the post plan with affected post detail slugs", () => {
    const plan = buildCategoryInvalidationPlan({
      oldSlug: "old",
      newSlug: "new",
      affectedPostSlugs: ["post-a", "post-b"],
    });
    expect(plan.paths).toContain("/categories/old");
    expect(plan.paths).toContain("/categories/new");
    expect(plan.paths).toContain("/posts/post-a");
    expect(plan.tags).toContain("post:post-b");
  });

  it("builds a tag plan", () => {
    const plan = buildTagInvalidationPlan({
      oldSlug: null,
      newSlug: "react",
      affectedPostSlugs: [],
    });
    expect(plan.paths).toContain("/tags");
    expect(plan.paths).toContain("/tags/react");
    expect(plan.tags).toContain("tag:react");
  });
});

describe("applyInvalidationPlan", () => {
  it("runs revalidatePath for every path and revalidateTag(max) for every tag", async () => {
    const revalidatePath = vi.fn();
    const revalidateTag = vi.fn();
    const onError = vi.fn();

    await applyInvalidationPlan(
      { paths: ["/", "/posts/a"], tags: ["posts", "post:a"] },
      { revalidatePath, revalidateTag, onError },
    );

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidateTag).toHaveBeenCalledWith("posts", "max");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports but does not throw when invalidation fails", async () => {
    const onError = vi.fn();
    await applyInvalidationPlan(
      { paths: ["/"], tags: [] },
      {
        revalidatePath: () => {
          throw new Error("boom");
        },
        revalidateTag: vi.fn(),
        onError,
      },
    );
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
