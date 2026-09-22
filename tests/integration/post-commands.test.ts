import { beforeEach, describe, expect, it } from "vitest";
import { postCommandService } from "@/modules/post";
import { ErrorCodes, AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { resetDatabase, createAdminUser, createTag } from "./helpers";
import { postRepository } from "@/modules/post/post.repository";
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

  it("guards the repository delete by both version and DRAFT status", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const saved = await postRepository.updateInTransaction(post.id, { title: "已保存", expectedVersion: post.version });
    expect(await postRepository.deleteDraftConditionally(post.id, post.version)).toBe(false);
    const published = await postRepository.updateInTransaction(post.id, { status: "PUBLISHED", publishedAt: new Date(), expectedVersion: saved.version });
    expect(await postRepository.deleteDraftConditionally(post.id, published.version)).toBe(false);
    expect(await postRepository.findAdminById(post.id)).toMatchObject({ status: "PUBLISHED", version: published.version });
  });
});
