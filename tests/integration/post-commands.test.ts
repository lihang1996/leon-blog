import { beforeEach, describe, expect, it } from "vitest";
import { postCommandService } from "@/modules/post";
import { ErrorCodes, AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { resetDatabase, createAdminUser, createTag } from "./helpers";

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

  it("maps a concurrent duplicate-slug P2002 to a stable 409, not a 500 (RQ-006)", async () => {
    // Two writers race past the slugExists pre-check; the unique index decides.
    // One must succeed and the other must surface POST_SLUG_EXISTS / 409, and
    // the database must contain exactly one row.
    const attempts = await Promise.allSettled([
      postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "race" }) }),
      postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "race" }) }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");
    expect(fulfilled.length).toBe(1);

    expect(rejected.length).toBe(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason as AppError;
    expect(reason).toBeInstanceOf(AppError);
    expect(reason.code).toBe(ErrorCodes.POST_SLUG_EXISTS);
    expect(reason.status).toBe(409);

    const count = await prisma.post.count({ where: { slug: "race" } });
    expect(count).toBe(1);
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
      input: { action: "publish" },
    });
    expect(published.post.status).toBe("PUBLISHED");
    expect(published.post.publishedAt).not.toBeNull();
    expect(published.changeSet.newSlug).toBe(post.slug);
  });

  it("keeps the original publishedAt when re-publishing after archive→restore", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    const published = await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "publish" } });
    const firstPublishedAt = published.post.publishedAt;

    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "archive" } });
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "restore" } });
    const republished = await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "publish" } });

    expect(republished.post.status).toBe("PUBLISHED");
    expect(republished.post.publishedAt).toBe(firstPublishedAt);
  });

  it("rejects illegal transitions with 422", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });

    // DRAFT → ARCHIVED is not allowed.
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "archive" } }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );

    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "publish" } });

    // PUBLISHED → DRAFT is not allowed.
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "restore" } }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });

  it("refuses to publish when required fields are missing (POST_NOT_READY)", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await postCommandService.updatePost({
      postId: post.id,
      actorId: authorId,
      input: { content: { excerpt: "" } },
    });
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "publish" } }),
      ErrorCodes.POST_NOT_READY,
      422,
    );
  });
});

describe("slug locking", () => {
  it("locks the slug after first publish (even when restored to draft)", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "publish" } });
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "archive" } });
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action: "restore" } });

    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { content: { slug: "new-slug" } },
      }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });
});

describe("post↔tag transaction", () => {
  it("rejects a reference to a nonexistent tag", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await expectError(
      postCommandService.updatePost({
        postId: post.id,
        actorId: authorId,
        input: { content: { tagIds: ["00000000-0000-4000-8000-000000000000"] } },
      }),
      ErrorCodes.TAG_NOT_FOUND,
      404,
    );
  });

  it("replaces tag links atomically", async () => {
    const tagA = await createTag("甲", "jia");
    const tagB = await createTag("乙", "yi");

    const created = await postCommandService.createDraft({ actorId: authorId, input: draftInput({ tagIds: [tagA.id] }) });
    const updated = await postCommandService.updatePost({
      postId: created.post.id,
      actorId: authorId,
      input: { content: { tagIds: [tagB.id] } },
    });

    expect(updated.post.tagIds).toEqual([tagB.id]);
    expect(updated.changeSet.newTagSlugs).toEqual(["yi"]);
  });
});

describe("deleteDraft", () => {
  it("only allows hard-deleting drafts", async () => {
    const { post } = await postCommandService.createDraft({ actorId: authorId, input: draftInput() });
    await postCommandService.deleteDraft({ postId: post.id }); // ok

    const published = await postCommandService.createDraft({ actorId: authorId, input: draftInput({ slug: "pub" }) });
    await postCommandService.updatePost({ postId: published.post.id, actorId: authorId, input: { action: "publish" } });
    await expectError(
      postCommandService.deleteDraft({ postId: published.post.id }),
      ErrorCodes.INVALID_POST_TRANSITION,
      422,
    );
  });
});
