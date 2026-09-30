import { describe, expect, it, vi } from "vitest";
import {
  buildInvalidationPlan,
  buildCategoryInvalidationPlan,
  buildFullPublicInvalidationPlan,
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

  it("always expires the cached sitemap alongside the public pages (FR-03 / delivery §4.2.4)", () => {
    expect(buildInvalidationPlan(base).paths).toContain("/sitemap.xml");
    expect(buildCategoryInvalidationPlan({ oldSlug: "a", newSlug: "b", affectedPostSlugs: [] }).paths).toContain("/sitemap.xml");
    expect(buildTagInvalidationPlan({ oldSlug: "a", newSlug: "b", affectedPostSlugs: [] }).paths).toContain("/sitemap.xml");
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
  it("runs revalidatePath for every path and revalidateTag({ expire: 0 }) for every tag", async () => {
    const revalidatePath = vi.fn();
    const revalidateTag = vi.fn();
    const onError = vi.fn();

    await applyInvalidationPlan(
      { paths: ["/", "/posts/a"], tags: ["posts", "post:a"] },
      { revalidatePath, revalidateTag, onError },
    );

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidateTag).toHaveBeenCalledWith("posts", { expire: 0 });
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

  it("continues invalidating later paths and tags after one target fails", async () => {
    const revalidatePath = vi.fn((path: string) => {
      if (path === "/broken") throw new Error("path failed");
    });
    const revalidateTag = vi.fn();
    const onError = vi.fn();

    await applyInvalidationPlan(
      { paths: ["/broken", "/posts"], tags: ["posts", "tags"] },
      { revalidatePath, revalidateTag, onError },
    );

    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports which targets failed without throwing (FR-03 / delivery §4.2)", async () => {
    const revalidatePath = vi.fn((path: string) => {
      if (path === "/broken") throw new Error("path failed");
    });
    const revalidateTag = vi.fn((tag: string) => {
      if (tag === "post:gone") throw new Error("tag failed");
    });

    const result = await applyInvalidationPlan(
      { paths: ["/broken", "/posts"], tags: ["posts", "post:gone"] },
      { revalidatePath, revalidateTag, onError: vi.fn() },
    );

    expect(result.ok).toBe(false);
    expect(result.failedTargets).toEqual(["path:/broken", "tag:post:gone"]);
    // Every other target was still attempted — a single failure skips nothing.
    expect(revalidatePath).toHaveBeenCalledWith("/posts");
    expect(revalidateTag).toHaveBeenCalledWith("posts", { expire: 0 });
  });

  it("reports ok when every target succeeds", async () => {
    const result = await applyInvalidationPlan(
      { paths: ["/", "/posts"], tags: ["posts"] },
      { revalidatePath: vi.fn(), revalidateTag: vi.fn(), onError: vi.fn() },
    );
    expect(result).toEqual({ ok: true, failedTargets: [] });
  });
});

describe("buildFullPublicInvalidationPlan (standalone revalidate endpoint)", () => {
  it("covers the blog's fixed public tags and paths, sitemap included", () => {
    const plan = buildFullPublicInvalidationPlan();
    expect([...plan.paths].sort()).toEqual(["/", "/categories", "/posts", "/sitemap.xml", "/tags"].sort());
    expect([...plan.tags].sort()).toEqual(["categories", "posts", "tags"].sort());
  });

  it("is a fixed set: no per-entity detail tags can appear", () => {
    const plan = buildFullPublicInvalidationPlan();
    expect(plan.tags.every((tag) => !tag.includes(":"))).toBe(true);
  });
});
