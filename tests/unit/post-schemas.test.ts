import { describe, expect, it } from "vitest";
import { updatePostSchema } from "@/modules/post/post.schemas";
import { normalizePostItem } from "@/lib/client-api";

describe("updatePostSchema", () => {
  it("does not materialize an omitted tagIds field as an empty array", () => {
    const parsed = updatePostSchema.parse({ content: { title: "只改标题" }, version: 0 });
    expect(parsed.content?.tagIds).toBeUndefined();
  });

  it("preserves an explicitly empty tagIds array so callers can clear tags", () => {
    const parsed = updatePostSchema.parse({ content: { tagIds: [] }, version: 1 });
    expect(parsed.content?.tagIds).toEqual([]);
  });

  it("requires a non-negative version for optimistic concurrency", () => {
    expect(() => updatePostSchema.parse({ content: { title: "缺版本" } })).toThrow();
    expect(() => updatePostSchema.parse({ action: "publish", version: -1 })).toThrow();
    expect(() => updatePostSchema.parse({ action: "publish", version: 2_147_483_648 })).toThrow();
    expect(updatePostSchema.parse({ action: "archive", version: 0 }).version).toBe(0);
  });
});

describe("client post contract", () => {
  it("preserves admin tagIds and does not invent public-only internal fields", () => {
    const admin = normalizePostItem({
      id: "post-id",
      title: "后台文章",
      slug: "admin-post",
      excerpt: "摘要",
      status: "DRAFT",
      tagIds: ["tag-id"],
      tags: [{ name: "React", slug: "react" }],
    });
    expect(admin.tagIds).toEqual(["tag-id"]);

    const publicPost = normalizePostItem({ title: "公开文章", slug: "public", excerpt: "摘要", tags: [] });
    expect(publicPost.id).toBeUndefined();
    expect(publicPost.status).toBeUndefined();
  });
});
