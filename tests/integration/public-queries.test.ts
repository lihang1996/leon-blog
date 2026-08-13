import { beforeEach, describe, expect, it } from "vitest";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { resetDatabase, createAdminUser, createCategory, createTag, createPost } from "./helpers";

/**
 * PRD §7.5 — "草稿不能通过公共接口获取". Every public query must be hard-coded
 * to PUBLISHED; drafts and archived posts must be invisible through lists,
 * detail, search, category and tag paths.
 */
let authorId: string;

beforeEach(async () => {
  await resetDatabase();
  authorId = (await createAdminUser()).id;
});

describe("public post list", () => {
  it("returns only PUBLISHED posts", async () => {
    await createPost({ authorId, title: "已发布", slug: "published", excerpt: "a", status: "PUBLISHED" });
    await createPost({ authorId, title: "草稿", slug: "draft", excerpt: "a", status: "DRAFT" });
    await createPost({ authorId, title: "已归档", slug: "archived", excerpt: "a", status: "ARCHIVED", publishedAt: new Date() });

    const { items, pagination } = await postQueryService.listPublishedPosts({ page: 1, pageSize: 10 });
    expect(items.map((post) => post.slug)).toEqual(["published"]);
    expect(pagination.total).toBe(1);
  });
});

describe("public post detail", () => {
  it("returns null for draft and archived slugs", async () => {
    await createPost({ authorId, title: "已发布", slug: "published", excerpt: "a", status: "PUBLISHED" });
    await createPost({ authorId, title: "草稿", slug: "draft", excerpt: "a", status: "DRAFT" });
    await createPost({ authorId, title: "已归档", slug: "archived", excerpt: "a", status: "ARCHIVED", publishedAt: new Date() });

    expect(await postQueryService.getPublishedPostBySlug("draft")).toBeNull();
    expect(await postQueryService.getPublishedPostBySlug("archived")).toBeNull();
    expect(await postQueryService.getPublishedPostBySlug("published")).not.toBeNull();
  });

  it("never returns draft content via the detail DTO", async () => {
    await createPost({ authorId, title: "机密草稿", slug: "secret-draft", excerpt: "机密内容", contentMd: "不应外泄", status: "DRAFT" });
    const post = await postQueryService.getPublishedPostBySlug("secret-draft");
    expect(post).toBeNull();
  });
});

describe("public search", () => {
  it("does not match drafts or archived posts", async () => {
    await createPost({ authorId, title: "公开文章", slug: "public", excerpt: "公开摘要", status: "PUBLISHED" });
    await createPost({ authorId, title: "机密草稿XYZ", slug: "secret-draft", excerpt: "机密摘要XYZ", status: "DRAFT" });
    await createPost({ authorId, title: "已归档XYZ", slug: "archived", excerpt: "归档摘要XYZ", status: "ARCHIVED", publishedAt: new Date() });

    const result = await postQueryService.searchPublishedPosts("XYZ", { page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });
});

describe("category and tag paths", () => {
  it("only returns published posts in a category", async () => {
    const category = await createCategory("前端", "frontend");
    await createPost({ authorId, title: "公开", slug: "c-pub", excerpt: "a", status: "PUBLISHED", categoryId: category.id });
    await createPost({ authorId, title: "草稿", slug: "c-draft", excerpt: "a", status: "DRAFT", categoryId: category.id });

    const { items } = await postQueryService.listPostsByCategory("frontend", { page: 1, pageSize: 10 });
    expect(items.map((post) => post.slug)).toEqual(["c-pub"]);
  });

  it("only returns published posts for a tag", async () => {
    const tag = await createTag("Next.js", "nextjs");
    await createPost({ authorId, title: "公开", slug: "t-pub", excerpt: "a", status: "PUBLISHED", tagIds: [tag.id] });
    await createPost({ authorId, title: "草稿", slug: "t-draft", excerpt: "a", status: "DRAFT", tagIds: [tag.id] });

    const { items } = await postQueryService.listPostsByTag("nextjs", { page: 1, pageSize: 10 });
    expect(items.map((post) => post.slug)).toEqual(["t-pub"]);
  });

  it("excludes categories and tags that only have drafts", async () => {
    const draftOnlyCategory = await createCategory("空分类", "empty-cat");
    await createPost({ authorId, title: "草稿", slug: "in-empty-cat", excerpt: "a", status: "DRAFT", categoryId: draftOnlyCategory.id });

    const tag = await createTag("空标签", "empty-tag");
    await createPost({ authorId, title: "草稿", slug: "in-empty-tag", excerpt: "a", status: "DRAFT", tagIds: [tag.id] });

    const categories = await categoryService.listPublicCategories();
    const tags = await tagService.listPublicTags();
    expect(categories.find((c) => c.slug === "empty-cat")).toBeUndefined();
    expect(tags.find((t) => t.slug === "empty-tag")).toBeUndefined();
  });
});
