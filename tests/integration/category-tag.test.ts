import { beforeEach, describe, expect, it } from "vitest";
import { categoryService } from "@/modules/category";
import { categoryRepository } from "@/modules/category/category.repository";
import { tagService } from "@/modules/tag";
import { tagRepository } from "@/modules/tag/tag.repository";
import { postQueryService } from "@/modules/post";
import { ErrorCodes, AppError } from "@/lib/errors";
import { resetDatabase, createAdminUser, createPost } from "./helpers";

/**
 * PRD §7.5 — 分类、标签关联。Deleting a category keeps posts (category → null);
 * deleting a tag removes only the post↔tag links; name/slug uniqueness is 409.
 */
let authorId: string;

beforeEach(async () => {
  await resetDatabase();
  authorId = (await createAdminUser()).id;
});

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise;
    throw new Error("expected an AppError but none was thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    expect((error as AppError).status).toBe(status);
  }
}

describe("category service", () => {
  it("creates and updates a category", async () => {
    const { category } = await categoryService.createCategory({ name: "前端", slug: "frontend", sortOrder: 7 });
    expect(category.slug).toBe("frontend");
    expect(category.sortOrder).toBe(7);
    expect(category.version).toBe(0);

    const updated = await categoryService.updateCategory(category.id, { name: "前端工程", slug: "frontend-eng", version: category.version });
    expect(updated.category.version).toBe(category.version + 1);
    expect(updated.category.name).toBe("前端工程");
    expect(updated.category.slug).toBe("frontend-eng");
    expect(updated.changeSet.oldSlug).toBe("frontend");
    expect(updated.changeSet.newSlug).toBe("frontend-eng");
  });

  it("rejects a duplicate name or slug with 409", async () => {
    await categoryService.createCategory({ name: "前端", slug: "frontend", sortOrder: 0 });
    await expectError(categoryService.createCategory({ name: "前端", slug: "other", sortOrder: 0 }), ErrorCodes.CATEGORY_NAME_EXISTS, 409);
    await expectError(categoryService.createCategory({ name: "其他", slug: "frontend", sortOrder: 0 }), ErrorCodes.CATEGORY_SLUG_EXISTS, 409);
  });

  it("maps a real DB P2002 on the name unique to 409 NAME_EXISTS (RQ-006, real adapter shape)", async () => {
    await categoryRepository.create({ name: "前端", slug: "frontend", description: null, icon: null, sortOrder: 1 });
    // Bypass the service pre-check so the DB unique index decides. This
    // exercises uniqueViolationField() against a real Prisma 7 P2002 error —
    // if the adapter error shape differs from the handler's assumption, this
    // test fails (it would surface CATEGORY_SLUG_EXISTS instead).
    await expectError(
      categoryRepository.create({ name: "前端", slug: "frontend-other", description: null, icon: null, sortOrder: 2 }),
      ErrorCodes.CATEGORY_NAME_EXISTS,
      409,
    );
  });

  it("keeps posts but sets category_id to null on delete", async () => {
    const { category } = await categoryService.createCategory({ name: "后端", slug: "backend", sortOrder: 0 });
    const post = await createPost({ authorId, title: "文章", slug: "in-backend", excerpt: "a", status: "PUBLISHED", categoryId: category.id });

    const result = await categoryService.deleteCategory(category.id, category.version);
    expect(result.affectedPostCount).toBeGreaterThanOrEqual(1);

    // Post still exists, category cleared.
    const detail = await postQueryService.getPublishedPostBySlug("in-backend");
    expect(detail?.category).toBeNull();
    expect(post.slug).toBe("in-backend");
  });

  it("returns the empty public detail for a category with no published posts", async () => {
    await categoryService.createCategory({ name: "空分类", slug: "empty-cat", sortOrder: 0 });
    const row = await categoryService.getPublicCategoryBySlug("empty-cat");
    expect(row).not.toBeNull();
    expect(row!.postCount).toBe(0);
  });

  it("rejects stale category updates and deletes without changing the saved version", async () => {
    const { category } = await categoryService.createCategory({ name: "并发", slug: "race-cat", sortOrder: 0 });
    const [baseline] = await categoryService.listAdminCategories();
    expect(baseline!.version).toBe(category.version);
    const saved = await categoryService.updateCategory(category.id, { name: "并发甲", version: baseline!.version });

    await expectError(
      categoryService.updateCategory(category.id, { name: "并发乙", version: baseline!.version }),
      ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION,
      409,
    );
    await expectError(
      categoryService.deleteCategory(category.id, baseline!.version),
      ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION,
      409,
    );
    expect(await categoryService.getAdminCategory(category.id)).toMatchObject({ name: "并发甲", version: saved.category.version });
    await categoryService.deleteCategory(category.id, saved.category.version);
  });

  it("conditionally updates and deletes categories at the repository boundary", async () => {
    const { category } = await categoryService.createCategory({ name: "条件", slug: "conditional-cat", sortOrder: 0 });
    const updated = await categoryRepository.update(category.id, { name: "已保存" }, category.version);
    expect(updated).toMatchObject({ name: "已保存", version: category.version + 1 });
    await expectError(
      categoryRepository.update(category.id, { name: "过期" }, category.version),
      ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION,
      409,
    );
    await expectError(categoryRepository.deleteAndUnlink(category.id, category.version), ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, 409);
    expect(await categoryRepository.findById(category.id)).toMatchObject({ name: "已保存", version: updated.version });
    await categoryRepository.deleteAndUnlink(category.id, updated.version);
  });

  it("maps delete-after-delete to 404 instead of 500", async () => {
    const { category } = await categoryService.createCategory({ name: "将删", slug: "to-delete", sortOrder: 0 });
    await categoryService.deleteCategory(category.id, category.version);
    await expectError(categoryService.deleteCategory(category.id, category.version), ErrorCodes.CATEGORY_NOT_FOUND, 404);
  });
});

describe("tag service", () => {
  it("creates and updates a tag", async () => {
    const { tag } = await tagService.createTag({ name: "React", slug: "react" });
    expect(tag.slug).toBe("react");
    expect(tag.version).toBe(0);

    const updated = await tagService.updateTag(tag.id, { slug: "react-19", version: tag.version });
    expect(updated.tag.slug).toBe("react-19");
    expect(updated.tag.version).toBe(tag.version + 1);
  });

  it("rejects a duplicate tag slug with 409", async () => {
    await tagService.createTag({ name: "React", slug: "react" });
    await expectError(tagService.createTag({ name: "React2", slug: "react" }), ErrorCodes.TAG_SLUG_EXISTS, 409);
  });

  it("maps a real DB P2002 on the tag name unique to 409 NAME_EXISTS (RQ-006, real adapter shape)", async () => {
    await tagRepository.create({ name: "React", slug: "react" });
    // Same intent as the category case: the real P2002 on the `name` unique
    // index must resolve to TAG_NAME_EXISTS, not fall through to the slug branch.
    await expectError(
      tagRepository.create({ name: "React", slug: "react-other" }),
      ErrorCodes.TAG_NAME_EXISTS,
      409,
    );
  });

  it("rejects stale tag updates and deletes without changing the saved version", async () => {
    const { tag } = await tagService.createTag({ name: "并发", slug: "race-tag" });
    const [baseline] = await tagService.listAdminTags();
    expect(baseline!.version).toBe(tag.version);
    const saved = await tagService.updateTag(tag.id, { name: "并发甲", version: baseline!.version });
    await expectError(
      tagService.updateTag(tag.id, { name: "并发乙", version: baseline!.version }),
      ErrorCodes.TAG_CONCURRENT_MODIFICATION,
      409,
    );
    await expectError(tagService.deleteTag(tag.id, baseline!.version), ErrorCodes.TAG_CONCURRENT_MODIFICATION, 409);
    expect(await tagService.listAdminTags()).toEqual([saved.tag]);
    await tagService.deleteTag(tag.id, saved.tag.version);
  });

  it("conditionally updates and deletes tags at the repository boundary", async () => {
    const { tag } = await tagService.createTag({ name: "条件", slug: "conditional-tag" });
    const updated = await tagRepository.update(tag.id, { name: "已保存" }, tag.version);
    expect(updated).toMatchObject({ name: "已保存", version: tag.version + 1 });
    await expectError(tagRepository.update(tag.id, { name: "过期" }, tag.version), ErrorCodes.TAG_CONCURRENT_MODIFICATION, 409);
    await expectError(tagRepository.deleteAndUnlink(tag.id, tag.version), ErrorCodes.TAG_CONCURRENT_MODIFICATION, 409);
    expect(await tagRepository.findById(tag.id)).toMatchObject({ name: "已保存", version: updated.version });
    await tagRepository.deleteAndUnlink(tag.id, updated.version);
  });

  it("maps delete-after-delete to 404 instead of 500", async () => {
    const { tag } = await tagService.createTag({ name: "将删", slug: "to-delete" });
    await tagService.deleteTag(tag.id, tag.version);
    await expectError(tagService.deleteTag(tag.id, tag.version), ErrorCodes.TAG_NOT_FOUND, 404);
  });

  it("removes only the post↔tag links on delete", async () => {
    const { tag } = await tagService.createTag({ name: "Prisma", slug: "prisma" });
    const post = await createPost({ authorId, title: "文章", slug: "with-tag", excerpt: "a", status: "PUBLISHED", tagIds: [tag.id] });

    const result = await tagService.deleteTag(tag.id, tag.version);
    expect(result.linkedPostCount).toBeGreaterThanOrEqual(1);

    const detail = await postQueryService.getPublishedPostBySlug("with-tag");
    expect(detail?.tags).toHaveLength(0);
    expect(post.slug).toBe("with-tag");
  });
});
