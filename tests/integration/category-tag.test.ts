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

    const updated = await categoryService.updateCategory(category.id, { name: "前端工程", slug: "frontend-eng" });
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
    await categoryRepository.create({ name: "前端", slug: "frontend", description: null, sortOrder: 1 });
    // Bypass the service pre-check so the DB unique index decides. This
    // exercises uniqueViolationField() against a real Prisma 7 P2002 error —
    // if the adapter error shape differs from the handler's assumption, this
    // test fails (it would surface CATEGORY_SLUG_EXISTS instead).
    await expectError(
      categoryRepository.create({ name: "前端", slug: "frontend-other", description: null, sortOrder: 2 }),
      ErrorCodes.CATEGORY_NAME_EXISTS,
      409,
    );
  });

  it("keeps posts but sets category_id to null on delete", async () => {
    const { category } = await categoryService.createCategory({ name: "后端", slug: "backend", sortOrder: 0 });
    const post = await createPost({ authorId, title: "文章", slug: "in-backend", excerpt: "a", status: "PUBLISHED", categoryId: category.id });

    const result = await categoryService.deleteCategory(category.id);
    expect(result.affectedPostCount).toBeGreaterThanOrEqual(1);

    // Post still exists, category cleared.
    const detail = await postQueryService.getPublishedPostBySlug("in-backend");
    expect(detail?.category).toBeNull();
    expect(post.slug).toBe("in-backend");
  });
});

describe("tag service", () => {
  it("creates and updates a tag", async () => {
    const { tag } = await tagService.createTag({ name: "React", slug: "react" });
    expect(tag.slug).toBe("react");

    const updated = await tagService.updateTag(tag.id, { slug: "react-19" });
    expect(updated.tag.slug).toBe("react-19");
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

  it("removes only the post↔tag links on delete", async () => {
    const { tag } = await tagService.createTag({ name: "Prisma", slug: "prisma" });
    const post = await createPost({ authorId, title: "文章", slug: "with-tag", excerpt: "a", status: "PUBLISHED", tagIds: [tag.id] });

    const result = await tagService.deleteTag(tag.id);
    expect(result.linkedPostCount).toBeGreaterThanOrEqual(1);

    const detail = await postQueryService.getPublishedPostBySlug("with-tag");
    expect(detail?.tags).toHaveLength(0);
    expect(post.slug).toBe("with-tag");
  });
});
