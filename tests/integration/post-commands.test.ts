import { beforeEach, describe, expect, it, vi } from "vitest";
import { postCommandService } from "@/modules/post";
import { ErrorCodes, AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { resetDatabase, createAdminUser, createTag } from "./helpers";
import { postRepository } from "@/modules/post/post.repository";
import { categoryRepository } from "@/modules/category/category.repository";
import { tagRepository } from "@/modules/tag/tag.repository";
import { updatePostSchema } from "@/modules/post";

/**
 * PRD §7.5 — 文章创建、编辑和发布 API + 文章状态转换 + slug 规则。
 * Exercises the real command service against PostgreSQL (single-transaction
 * post+tags update, publish validation, slug locking, delete rules).
 */
let authorId: string;

beforeEach(async () => {
  await resetDatabase();
  authorId = (await createAdminUser()).id;
});

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "测试文章",
    excerpt: "摘要内容",
    contentMd: "# 标题\n\n正文",
    ...overrides,
  };
}

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

describe("createDraft", () => {
  it("creates a DRAFT and auto-generates a slug from an ASCII title", async () => {
    const { post } = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ title: "Hello World" }),
    });
    expect(post.status).toBe("DRAFT");
    expect(post.slug).toBe("hello-world");
    expect(post.publishedAt).toBeNull();
    expect(typeof post.version).toBe("number");
  });

  it("falls back to a post-xxxx slug for Chinese titles", async () => {
    const { post } = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ title: "中文标题" }),
    });
    expect(post.slug).toMatch(/^post-[a-z0-9]{8}$/);
  });

  it("rejects a slug conflict with 409", async () => {
    await postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "dup" }) });
    await expectError(
      postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "dup" }) }),
      ErrorCodes.POST_SLUG_EXISTS,
      409,
    );
  });

  it("maps a duplicate-slug P2002 to a stable 409 at the repository boundary", async () => {
    await postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "race" }) });
    await expectError(
      postRepository.create({
        ...draftInput(), authorId, slug: "race", categoryId: null, coverImageUrl: null,
        seoTitle: null, seoDescription: null, seoImageUrl: null, tagIds: [],
      }),
      ErrorCodes.POST_SLUG_EXISTS,
      409,
    );
    expect(await prisma.post.count({ where: { slug: "race" } })).toBe(1);
  });

  it("rejects an invalid slug format", async () => {
    await expectError(
      postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "Bad Slug!" }) }),
      ErrorCodes.VALIDATION_FAILED,
      422,
    );
  });
});

describe("publish / status transitions", () => {
  it("publishes a draft and stamps publishedAt once", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const published = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: post.version },
    });
    expect(published.post.status).toBe("PUBLISHED");
    expect(published.post.publishedAt).not.toBeNull();
    expect(published.changeSet.newSlug).toBe(post.slug);
    expect(published.post.version).toBe(post.version + 1);
  });

  it("keeps the original publishedAt when re-publishing after archive→restore", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const published = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: post.version },
    });
    const firstPublishedAt = published.post.publishedAt;

    const archived = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "archive", version: published.post.version },
    });
    const restored = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "restore", version: archived.post.version },
    });
    const republished = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: restored.post.version },
    });

    expect(republished.post.status).toBe("PUBLISHED");
    expect(republished.post.publishedAt).toBe(firstPublishedAt);
  });

  it("rejects illegal transitions with 422", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { action: "archive", version: post.version },
      }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );

    const published = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: post.version },
    });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { action: "restore", version: published.post.version },
      }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });

  it("refuses to publish when required fields are missing (POST_NOT_READY)", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    // Bypass Zod so we can persist an empty excerpt that fails publish readiness.
    await prisma.post.update({ where: { id: post.id }, data: { excerpt: "" } });
    const row = await postRepository.findAdminById(post.id);
    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { action: "publish", version: row!.version },
      }),
      ErrorCodes.POST_NOT_READY,
      422,
    );
  });
});

describe("slug locking", () => {
  it("locks the slug after first publish (even when restored to draft)", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const published = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: post.version },
    });
    const archived = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "archive", version: published.post.version },
    });
    const restored = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "restore", version: archived.post.version },
    });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { content: { slug: "new-slug" }, version: restored.post.version },
      }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });

  it("accepts the unchanged slug when saving an already-published article", async () => {
    const { post } = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ slug: "stable-slug" }),
    });
    const published = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { action: "publish", version: post.version },
    });

    const updated = await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: {
        content: { title: "发布后修正文案", slug: "stable-slug" },
        version: published.post.version,
      },
    });
    expect(updated.post.title).toBe("发布后修正文案");
    expect(updated.post.slug).toBe("stable-slug");
  });
});

describe("post↔tag transaction", () => {
  it("rejects a reference to a nonexistent tag", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: {
          content: { tagIds: ["00000000-0000-4000-8000-000000000000"] },
          version: post.version,
        },
      }),
      ErrorCodes.TAG_NOT_FOUND,
      404,
    );
  });

  it("replaces tag links atomically", async () => {
    const tagA = await createTag("甲", "jia");
    const tagB = await createTag("乙", "yi");

    const created = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ tagIds: [tagA.id] }),
    });
    const updated = await postCommandService.updatePost({
      postId: created.post.id,
      actorId: authorId,
      input: { content: { tagIds: [tagB.id] }, version: created.post.version },
    });

    expect(updated.post.tagIds).toEqual([tagB.id]);
    expect(updated.changeSet.newTagSlugs).toEqual(["yi"]);
  });

  it("treats mixed-case tag UUIDs as the same identity (FR-22)", async () => {
    const tag = await createTag("大小写", "case-tag");
    const upper = tag.id.toUpperCase();
    const mixed = upper.slice(0, 14) + tag.id.slice(14, 23).toUpperCase() + tag.id.slice(23);

    // Same id in three cases on create: one identity, no "存在不存在的标签".
    const created = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ tagIds: [upper, mixed, tag.id] }),
    });
    expect(created.post.tagIds).toEqual([tag.id]);

    // Mixed-case replacement on update keeps working and dedupes to one.
    const updated = await postCommandService.updatePost({
      postId: created.post.id,
      actorId: authorId,
      input: { content: { tagIds: [mixed] }, version: created.post.version },
    });
    expect(updated.post.tagIds).toEqual([tag.id]);
    expect(updated.changeSet.newTagSlugs).toEqual(["case-tag"]);
  });

  it("keeps existing tags on a title-only PATCH payload", async () => {
    const tag = await createTag("保留", "keep");
    const created = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ tagIds: [tag.id] }),
    });
    const input = updatePostSchema.parse({
      content: { title: "只改标题" },
      version: created.post.version,
    });

    const updated = await postCommandService.updatePost({
      postId: created.post.id,
      actorId: authorId,
      input,
    });
    expect(updated.post.tagIds).toEqual([tag.id]);
  });
});

describe("optimistic concurrency", () => {
  it("rejects a second repository write using the same baseline version", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const updated = await postRepository.updateInTransaction(post.id, { title: "writer-a", expectedVersion: post.version });
    expect(updated.version).toBe(post.version + 1);

    await expectError(
      postRepository.updateInTransaction(post.id, { title: "writer-b", expectedVersion: post.version }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION,
      409,
    );
    expect(await postRepository.findAdminById(post.id)).toMatchObject({ title: "writer-a", version: updated.version });
  });

  it("rejects a stale client version at the command layer with 409", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { content: { title: "第一版" }, version: post.version },
    });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { content: { title: "过期标签页" }, version: post.version },
      }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION,
      409,
    );
  });
});

describe("deleteDraft", () => {
  it("only allows hard-deleting drafts", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await postCommandService.deleteDraft({ postId: post.id, version: post.version });

    const draft = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ slug: "pub" }),
    });
    const published = await postCommandService.updatePost({
      postId: draft.post.id,
      actorId: authorId,
      input: { action: "publish", version: draft.post.version },
    });
    await expectError(
      postCommandService.deleteDraft({ postId: draft.post.id, version: draft.post.version }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION,
      409,
    );
    await expectError(
      postCommandService.deleteDraft({ postId: published.post.id, version: published.post.version }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });

  it("rejects deleting a draft edited since the client's baseline", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const saved = await postCommandService.updatePost({
      postId: post.id, actorId: authorId,
      input: { content: { title: "已保存" }, version: post.version },
    });
    await expectError(
      postCommandService.deleteDraft({ postId: post.id, version: post.version }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION,
      409,
    );
    expect(await postRepository.findAdminById(post.id)).toMatchObject({ title: "已保存", version: saved.post.version });
    await postCommandService.deleteDraft({ postId: post.id, version: saved.post.version });
    expect(await postRepository.findAdminById(post.id)).toBeNull();
  });

  it("guards the repository delete by version and the DRAFT|ARCHIVED status set", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const saved = await postRepository.updateInTransaction(post.id, { title: "已保存", expectedVersion: post.version });
    // stale version → no-op
    expect(await postRepository.deleteConditionally(post.id, post.version, ["DRAFT", "ARCHIVED"])).toBe(false);
    const published = await postRepository.updateInTransaction(post.id, { status: "PUBLISHED", publishedAt: new Date(), expectedVersion: saved.version });
    // status no longer deletable → no-op
    expect(await postRepository.deleteConditionally(post.id, published.version, ["DRAFT", "ARCHIVED"])).toBe(false);
    expect(await postRepository.findAdminById(post.id)).toMatchObject({ status: "PUBLISHED", version: published.version });

    // archive then hard-delete succeeds
    const archived = await postRepository.updateInTransaction(post.id, { status: "ARCHIVED", expectedVersion: published.version });
    expect(await postRepository.deleteConditionally(post.id, archived.version, ["DRAFT", "ARCHIVED"])).toBe(true);
    expect(await postRepository.findAdminById(post.id)).toBeNull();
  });
});

describe("FR-03: commit result and invalidation data are one unit (AC-03-01/02)", () => {
  it("builds the update changeSet from the loaded + transaction rows with NO post-commit association lookups", async () => {
    const categoryA = await prisma.category.create({ data: { name: "甲类", slug: "cat-a" }, select: { id: true, slug: true } });
    const categoryB = await prisma.category.create({ data: { name: "乙类", slug: "cat-b" }, select: { id: true, slug: true } });
    const tagOld = await createTag("旧", "old-tag");
    const tagNew = await createTag("新", "new-tag");

    const created = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ slug: "plan", categoryId: categoryA.id, tagIds: [tagOld.id] }),
    });

    const findById = vi.fn();
    const findSlugs = vi.fn();
    const realFindById = categoryRepository.findById.bind(categoryRepository);
    const realFindSlugs = tagRepository.findSlugsByIds.bind(tagRepository);
    const spyFindById = vi.spyOn(categoryRepository, "findById").mockImplementation(async (id: string) => {
      findById(id);
      return realFindById(id);
    });
    const spyFindSlugs = vi.spyOn(tagRepository, "findSlugsByIds").mockImplementation(async (ids: string[]) => {
      findSlugs(ids);
      return realFindSlugs(ids);
    });

    try {
      const result = await postCommandService.updatePost({
        postId: created.post.id,
        actorId: authorId,
        input: {
          content: { title: "改题", categoryId: categoryB.id, tagIds: [tagNew.id] },
          version: created.post.version,
        },
      });

      // Only the PRE-commit existence checks ran: one category lookup (the new
      // category) and one tag lookup (the new tags). The old associations come
      // from the loaded row and the new ones from the transaction row — a
      // failing lookup after the commit can no longer orphan the result.
      expect(findById).toHaveBeenCalledTimes(1);
      expect(findById).toHaveBeenCalledWith(categoryB.id);
      expect(findSlugs).toHaveBeenCalledTimes(1);
      expect(findSlugs).toHaveBeenCalledWith([tagNew.id]);

      // The plan data is complete and correct without any post-commit query.
      expect(result.changeSet).toEqual({
        oldSlug: "plan",
        newSlug: "plan",
        oldCategorySlug: "cat-a",
        newCategorySlug: "cat-b",
        oldTagSlugs: ["old-tag"],
        newTagSlugs: ["new-tag"],
      });
    } finally {
      spyFindById.mockRestore();
      spyFindSlugs.mockRestore();
    }
  });

  it("builds the create changeSet from the committed row (associations included)", async () => {
    const category = await prisma.category.create({ data: { name: "创建类", slug: "cat-create" }, select: { id: true, slug: true } });
    const tag = await createTag("创建标签", "created-tag");

    const { changeSet } = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ slug: "fresh", categoryId: category.id, tagIds: [tag.id] }),
    });

    expect(changeSet).toEqual({
      oldSlug: null,
      newSlug: "fresh",
      oldCategorySlug: null,
      newCategorySlug: "cat-create",
      oldTagSlugs: [],
      newTagSlugs: ["created-tag"],
    });
  });

  it("rolls the whole update back when the transaction fails — no partial write (AC-03-01)", async () => {
    const tag = await createTag("存在", "exists");
    const { post } = await postCommandService.createDraft({
      actorId: authorId,
      input: draftInput({ slug: "atomic", tagIds: [tag.id] }),
    });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: {
          content: {
            title: "不应生效的标题",
            tagIds: [tag.id, "00000000-0000-4000-8000-000000000000"],
          },
          version: post.version,
        },
      }),
      ErrorCodes.TAG_NOT_FOUND,
      404,
    );

    const after = await postRepository.findAdminById(post.id);
    expect(after).toMatchObject({ title: "测试文章", version: post.version });
    expect(after?.postTags.map((pt) => pt.tagId)).toEqual([tag.id]);
  });
});

describe("deleteConditionally concurrency (B01)", () => {
  it("rolls back taxonomy bumps when the post row is concurrently modified after the check (count=0 must abort the transaction)", async () => {
    const category = await prisma.category.create({
      data: { name: "删除类B01", slug: "cat-del-b01" },
      select: { id: true, version: true, updatedAt: true },
    });
    const tag = await prisma.tag.create({
      data: { name: "删除标B01", slug: "tag-del-b01" },
      select: { id: true, version: true, updatedAt: true },
    });
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const stored = await prisma.post.findUniqueOrThrow({
      where: { slug: post.slug },
      select: { id: true, version: true },
    });
    await prisma.post.update({
      where: { id: stored.id },
      data: { categoryId: category.id, postTags: { create: [{ tagId: tag.id }] } },
    });

    // Barrier inside the check→delete race window: after the taxonomy bumps
    // have run inside the delete transaction, another writer bumps the post
    // version, so deleteMany (version-gated) matches 0 rows. The old code
    // returned false inside the callback → transaction COMMITTED with the
    // bumps applied; the fix throws inside the tx → full rollback.
    const deleted = await postRepository.deleteConditionally(
      stored.id,
      stored.version,
      ["DRAFT", "ARCHIVED"],
      {
        beforeDelete: async () => {
          await prisma.post.update({
            where: { id: stored.id },
            data: { contentMd: "并发修改", version: { increment: 1 } },
          });
        },
      },
    );

    expect(deleted).toBe(false);

    // The post survived, carrying the concurrent writer's change.
    const survivor = await prisma.post.findUniqueOrThrow({
      where: { id: stored.id },
      select: { version: true, contentMd: true },
    });
    expect(survivor.version).toBe(stored.version + 1);
    expect(survivor.contentMd).toBe("并发修改");

    // Taxonomy rows are exactly as before the failed delete: version AND
    // updatedAt untouched (a committed bump would change both).
    const categoryAfter = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
      select: { version: true, updatedAt: true },
    });
    expect(categoryAfter.version).toBe(category.version);
    expect(categoryAfter.updatedAt).toEqual(category.updatedAt);

    const tagAfter = await prisma.tag.findUniqueOrThrow({
      where: { id: tag.id },
      select: { version: true, updatedAt: true },
    });
    expect(tagAfter.version).toBe(tag.version);
    expect(tagAfter.updatedAt).toEqual(tag.updatedAt);
  });
});
