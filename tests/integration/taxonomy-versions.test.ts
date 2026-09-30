import { beforeEach, describe, expect, it } from "vitest";
import { prisma, pgPool, foreignKeyConstraintName, isForeignKeyViolation } from "@/lib/db/prisma";
import { postCommandService } from "@/modules/post";
import { postRepository } from "@/modules/post/post.repository";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { AppError, ErrorCodes } from "@/lib/errors";
import { resetDatabase, createAdminUser, createCategory, createTag } from "./helpers";
import type { PoolClient } from "pg";

/**
 * T-034 data batch (FR-04/05/21) against real PostgreSQL:
 * - §4.3 matrix: taxonomy membership-epoch bumps share the post's transaction.
 * - FR-04: unlinking bumps every affected post's version/updatedAt; old
 *   baselines get 409; latest+vanished gets 404; atomic rollback.
 * - FR-05: deletes are version-guarded against association changes, same
 *   count swaps included; both barrier orders (write-first, delete-first).
 * - FR-21: taxonomy-FK whitelist mapping verified with the REAL pg adapter
 *   error; other FKs / DB errors keep the internal path.
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

async function createPostWith(args: { slug: string; status?: "DRAFT" | "PUBLISHED" | "ARCHIVED"; categoryId?: string | null; tagIds?: string[] }) {
  const created = await postCommandService.createDraft({
    actorId: authorId,
    input: { title: `文章-${args.slug}`, slug: args.slug, excerpt: "摘要", contentMd: `# ${args.slug}`, categoryId: args.categoryId ?? null, tagIds: args.tagIds ?? [] },
  });
  if (!args.status || args.status === "DRAFT") return created.post;
  const target = await postCommandService.updatePost({ postId: created.post.id, actorId: authorId, input: { action: "publish", version: created.post.version } });
  if (args.status === "PUBLISHED") return target.post;
  const archived = await postCommandService.updatePost({ postId: target.post.id, actorId: authorId, input: { action: "archive", version: target.post.version } });
  return archived.post;
}

async function versionsOf(ids: string[]): Promise<Map<string, { version: number; updatedAt: Date; title: string; status: string; publishedAt: Date | null }>> {
  const rows = await prisma.post.findMany({ where: { id: { in: ids } }, select: { id: true, version: true, updatedAt: true, title: true, status: true, publishedAt: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

describe("§4.3 membership-epoch matrix (FR-05 AC-05-04)", () => {
  it("creating a post bumps every newly-linked category/tag exactly once", async () => {
    const cat = await createCategory("分类", "cat");
    const tagA = await createTag("甲", "a");
    const tagB = await createTag("乙", "b");
    const before = await prisma.$transaction([
      prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tagA.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tagB.id }, select: { version: true } }),
    ]);
    const post = await createPostWith({ slug: "linked", categoryId: cat.id, tagIds: [tagA.id, tagB.id] });
    const after = await prisma.$transaction([
      prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tagA.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tagB.id }, select: { version: true } }),
    ]);
    expect(post.version).toBe(0);
    expect(after[0].version).toBe(before[0].version + 1);
    expect(after[1].version).toBe(before[1].version + 1);
    expect(after[2].version).toBe(before[2].version + 1);
  });

  it("category move A→B bumps both sides once; a null side bumps nothing", async () => {
    const a = await createCategory("甲类", "cat-a");
    const b = await createCategory("乙类", "cat-b");
    const post = await createPostWith({ slug: "move", categoryId: a.id });
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { categoryId: b.id }, version: post.version } });
    let versions = await prisma.category.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, version: true } });
    expect(Object.fromEntries(versions.map((v) => [v.id, v.version]))).toMatchObject({ [a.id]: 2, [b.id]: 1 });

    // B → 未分类: only B bumps again.
    const reloaded = await postRepository.findAdminById(post.id);
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { categoryId: null }, version: reloaded!.version } });
    versions = await prisma.category.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, version: true } });
    expect(Object.fromEntries(versions.map((v) => [v.id, v.version]))).toMatchObject({ [a.id]: 2, [b.id]: 2 });
  });

  it("tag add/remove bumps only changed members; a pure reorder bumps nothing", async () => {
    const a = await createTag("甲", "tag-a");
    const b = await createTag("乙", "tag-b");
    const c = await createTag("丙", "tag-c");
    const post = await createPostWith({ slug: "tag-shuffle", tagIds: [a.id, b.id] });

    // add C, drop B: A unchanged, B +1 (left), C +1 (entered)
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { tagIds: [a.id, c.id] }, version: post.version } });
    let v = await prisma.tag.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { id: true, version: true } });
    expect(Object.fromEntries(v.map((x) => [x.id, x.version]))).toMatchObject({ [a.id]: 1, [b.id]: 2, [c.id]: 1 });

    // reorder only (C then A): nobody bumps, but the post still versions +1
    const reloaded = await postRepository.findAdminById(post.id);
    await postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { tagIds: [c.id, a.id] }, version: reloaded!.version } });
    v = await prisma.tag.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { id: true, version: true } });
    expect(Object.fromEntries(v.map((x) => [x.id, x.version]))).toMatchObject({ [a.id]: 1, [b.id]: 2, [c.id]: 1 });
    expect((await postRepository.findAdminById(post.id))!.version).toBe(reloaded!.version + 1);
  });

  it("hard-deleting a draft bumps its former category/tags; publish/archive/restore never touch them", async () => {
    const cat = await createCategory("删除类", "cat-del");
    const tag = await createTag("删除标签", "tag-del");
    const draft = await createPostWith({ slug: "gone", categoryId: cat.id, tagIds: [tag.id] });
    // status transitions with unchanged association: taxonomy stays at 1/1
    const published = await postCommandService.updatePost({ postId: draft.id, actorId: authorId, input: { action: "publish", version: draft.version } });
    const archived = await postCommandService.updatePost({ postId: published.post.id, actorId: authorId, input: { action: "archive", version: published.post.version } });
    let v = await prisma.$transaction([
      prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } }),
    ]);
    expect([v[0].version, v[1].version]).toEqual([1, 1]);

    await postCommandService.deleteDraft({ postId: archived.post.id, version: archived.post.version });
    v = await prisma.$transaction([
      prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } }),
    ]);
    expect([v[0].version, v[1].version]).toEqual([2, 2]);
  });
});

describe("FR-04 unlink bumps affected posts atomically", () => {
  it("AC-04-01: posts in all three states bump version+updatedAt, keep title/status/publishedAt; unrelated posts untouched", async () => {
    const cat = await createCategory("三类", "cat-3");
    const draft = await createPostWith({ slug: "d1", categoryId: cat.id });
    const publishedPost = await createPostWith({ slug: "p1", categoryId: cat.id, status: "PUBLISHED" });
    const archivedPost = await createPostWith({ slug: "a1", categoryId: cat.id, status: "ARCHIVED" });
    const bystander = await createPostWith({ slug: "free" });

    const before = await versionsOf([draft.id, publishedPost.id, archivedPost.id, bystander.id]);
    await new Promise((r) => setTimeout(r, 10)); // ensure updatedAt can move

    const fresh = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
    await categoryService.deleteCategory(cat.id, fresh.version);

    const after = await versionsOf([draft.id, publishedPost.id, archivedPost.id, bystander.id]);
    for (const id of [draft.id, publishedPost.id, archivedPost.id]) {
      expect(after.get(id)!.version).toBe(before.get(id)!.version + 1);
      expect(after.get(id)!.updatedAt.getTime()).toBeGreaterThan(before.get(id)!.updatedAt.getTime());
      expect(after.get(id)!.title).toBe(before.get(id)!.title);
      expect(after.get(id)!.status).toBe(before.get(id)!.status);
      expect(after.get(id)!.publishedAt?.getTime()).toBe(before.get(id)!.publishedAt?.getTime());
    }
    expect(after.get(bystander.id)!.version).toBe(before.get(bystander.id)!.version);
    // unlinked, not deleted
    expect((await postRepository.findAdminById(draft.id))!.categoryId).toBeNull();
  });

  it("AC-04-02: after the unlink, every old-baseline action and full update gets 409 and changes nothing", async () => {
    const tag = await createTag("旧基线", "old-base");
    const post = await createPostWith({ slug: "conflict", tagIds: [tag.id], status: "PUBLISHED" });
    const fresh = (await tagService.listAdminTags()).find((t) => t.id === tag.id)!;
    await tagService.deleteTag(tag.id, fresh.version);

    for (const action of ["publish", "archive", "restore"] as const) {
      await expectError(
        postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { action, version: post.version } }),
        ErrorCodes.POST_CONCURRENT_MODIFICATION, 409,
      );
    }
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { title: "不应生效" }, version: post.version } }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION, 409,
    );
    expect((await postRepository.findAdminById(post.id))!.title).toBe("文章-conflict");
  });

  it("AC-04-03: old version + vanished relation → version conflict; latest version + vanished relation → relation-missing 404", async () => {
    const cat = await createCategory("竞争", "race-cat");
    const tag = await createTag("竞争标签", "race-tag");
    const post = await createPostWith({ slug: "race", categoryId: cat.id, tagIds: [tag.id] });
    await categoryService.deleteCategory(cat.id, (await prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } })).version);
    await tagService.deleteTag(tag.id, (await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).version);
    const latest = await postRepository.findAdminById(post.id);

    // OLD baseline: the version check fires first (§4.3 ordering).
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { categoryId: null }, version: post.version } }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION, 409,
    );
    // LATEST baseline + vanished relations → relation-missing 404s.
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { categoryId: cat.id }, version: latest!.version } }),
      ErrorCodes.CATEGORY_NOT_FOUND, 404,
    );
    await expectError(
      postCommandService.updatePost({ postId: post.id, actorId: authorId, input: { content: { tagIds: [tag.id] }, version: latest!.version } }),
      ErrorCodes.TAG_NOT_FOUND, 404,
    );
  });

  it("AC-04-04: a REAL membership change bumps first, then a vanished target aborts — every bump rolls back (no wrong-order claim)", async () => {
    const tagA = await createTag("共享甲", "shared-a");
    const tagB = await createTag("共享乙", "shared-b"); // genuinely ENTERS the set below
    const linked = await createPostWith({ slug: "in-set", tagIds: [tagA.id] });
    const outsider = await createPostWith({ slug: "out-set" });
    const before = await prisma.tag.findMany({
      where: { id: { in: [tagA.id, tagB.id] } },
      select: { id: true, version: true, updatedAt: true },
    });
    await new Promise((r) => setTimeout(r, 10));

    // Old set {A}; new set [B, missing]: B really enters (its bump EXECUTES
    // and is locked), then the vanished target's bump fails the transaction.
    await expectError(
      postRepository.updateInTransaction(linked.id, {
        tagIds: [tagB.id, "00000000-0000-4000-8000-000000000000"],
        expectedVersion: linked.version,
      }),
      ErrorCodes.TAG_NOT_FOUND, 404,
    );
    // The genuinely-changed row B is back to its exact pre-state.
    const after = await prisma.tag.findMany({
      where: { id: { in: [tagA.id, tagB.id] } },
      select: { id: true, version: true, updatedAt: true },
    });
    for (const row of after) {
      const b = before.find((x) => x.id === row.id)!;
      expect(row.version).toBe(b.version);
      expect(row.updatedAt.getTime()).toBe(b.updatedAt.getTime());
    }
    const post = await postRepository.findAdminById(linked.id);
    expect(post!.version).toBe(linked.version);
    expect(post!.postTags.map((pt) => pt.tagId)).toEqual([tagA.id]);
    expect((await postRepository.findAdminById(outsider.id))!.version).toBe(outsider.version);
  });
});

describe("FR-05 delete confirmations bind to the live association set", () => {
  it("AC-05-01: a 0-post confirmation conflicts after another window links one post; the link survives", async () => {
    const cat = await createCategory("零篇", "zero");
    const confirmed = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
    expect(confirmed.postCount).toBe(0);

    await createPostWith({ slug: "late-link", categoryId: cat.id });
    await expectError(categoryService.deleteCategory(cat.id, confirmed.version), ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, 409);

    const post = await prisma.post.findFirstOrThrow({ where: { slug: "late-link" } });
    expect(post.categoryId).toBe(cat.id);
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).not.toBeNull();
  });

  it("AC-05-02: swapping one post for another (same count) still conflicts the stale confirmation", async () => {
    const cat = await createCategory("等数", "same-count");
    const other = await createCategory("等数外", "other-cat");
    const p1 = await createPostWith({ slug: "swap-1", categoryId: cat.id });
    await createPostWith({ slug: "swap-2", categoryId: cat.id });
    const confirmed = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
    expect(confirmed.postCount).toBe(2);

    // swap: p1 leaves, p3 enters — count stays 2, but two membership epochs pass.
    await postCommandService.updatePost({ postId: p1.id, actorId: authorId, input: { content: { categoryId: other.id }, version: p1.version } });
    await createPostWith({ slug: "swap-3", categoryId: cat.id });

    await expectError(categoryService.deleteCategory(cat.id, confirmed.version), ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, 409);
  });

  it("AC-05-03: a refreshed confirmation deletes and reports the transaction's real count (not the snapshot's)", async () => {
    const cat = await createCategory("刷新", "refresh");
    await createPostWith({ slug: "r1", categoryId: cat.id });
    await createPostWith({ slug: "r2", categoryId: cat.id, status: "PUBLISHED" });
    const stale = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
    // membership epoch moves on after the snapshot was taken
    await createPostWith({ slug: "r3", categoryId: cat.id });
    await expectError(categoryService.deleteCategory(cat.id, stale.version), ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, 409);

    const beforeDelete = await prisma.post.findMany({ where: { slug: { in: ["r1", "r2", "r3"] } }, select: { slug: true, version: true } });
    const fresh = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
    const result = await categoryService.deleteCategory(cat.id, fresh.version);
    expect(result.affectedPostCount).toBe(3); // the transaction's real count
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
    const unlinked = await prisma.post.findMany({ where: { slug: { in: ["r1", "r2", "r3"] } }, select: { slug: true, categoryId: true, version: true } });
    for (const row of unlinked) {
      const before = beforeDelete.find((b) => b.slug === row.slug)!.version;
      expect(row.categoryId).toBeNull();
      expect(row.version).toBe(before + 1);
    }
  });

  it("AC-05-05 barriers: delete-first leaves the racing write a 404 with full rollback; write-first leaves the delete a 409", async () => {
    const cat = await createCategory("屏障", "barrier");
    const tag = await createTag("屏障标签", "barrier-tag");
    const post = await createPostWith({ slug: "barrier-post", categoryId: cat.id, tagIds: [tag.id] });

    // delete commits first → racing post write hits relation-missing 404s and
    // leaves the post untouched (deleted-category link already nulled by the
    // delete; the vanished TAG is what the write references).
    const freshTag = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } });
    await tagService.deleteTag(tag.id, freshTag.version);
    const latest = await postRepository.findAdminById(post.id);
    await expectError(
      postRepository.updateInTransaction(post.id, { tagIds: [tag.id], expectedVersion: latest!.version }),
      ErrorCodes.TAG_NOT_FOUND, 404,
    );
    expect((await postRepository.findAdminById(post.id))!.postTags).toHaveLength(0); // cascade removed the link; nothing re-added

    // write commits first → the stale delete confirmation gets 409
    const cat2 = await createCategory("屏障二", "barrier-2");
    const p2 = await createPostWith({ slug: "barrier-2-post" });
    const confirmed = (await categoryService.listAdminCategories()).find((c) => c.id === cat2.id)!;
    await postCommandService.updatePost({ postId: p2.id, actorId: authorId, input: { content: { categoryId: cat2.id }, version: p2.version } });
    await expectError(categoryService.deleteCategory(cat2.id, confirmed.version), ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION, 409);
  });
});

describe("FR-21 precise FK semantics against the real pg adapter", () => {
  it("a REAL Prisma P2003 (postTag.create against a vanished tag) exposes the whitelisted constraint via the adapter's own nesting", async () => {
    const post = await createPostWith({ slug: "fk-probe" });
    const bogusTag = "00000000-0000-4000-8000-00000000000f";
    let prismaError: unknown;
    try {
      await prisma.postTag.create({ data: { postId: post.id, tagId: bogusTag } });
      throw new Error("expected the FK insert to fail");
    } catch (error) {
      prismaError = error;
    }
    // The error object is Prisma's own — no synthetic wrapping.
    expect(isForeignKeyViolation(prismaError)).toBe(true);
    expect(foreignKeyConstraintName(prismaError)).toBe("post_tags_tag_id_fkey");
  });

  it("AC-21-04: an author-FK violation and a non-FK database error keep the real internal path", async () => {
    // author FK: real P2003, but NOT whitelisted → must NOT map to a taxonomy 404
    let authorFk: unknown;
    try {
      await prisma.post.create({
        data: { authorId: "00000000-0000-4000-8000-0000000000ff", title: "x", slug: "author-fk", excerpt: "x", contentMd: "x" },
      });
      throw new Error("expected the author FK insert to fail");
    } catch (error) {
      authorFk = error;
    }
    expect(isForeignKeyViolation(authorFk)).toBe(true);
    expect(foreignKeyConstraintName(authorFk)).toBe("posts_author_id_fkey");

    // DB unreachable / generic failures are not P2003 at all.
    const generic = new Error("connect ECONNREFUSED");
    expect(isForeignKeyViolation(generic)).toBe(false);
    expect(foreignKeyConstraintName(generic)).toBeNull();
  });

  it("AC-21-02: create and update surface relation-missing 404s, never a generic 500 or partial write", async () => {
    await expectError(
      postRepository.updateInTransaction("00000000-0000-4000-8000-0000000000aa", { title: "x", expectedVersion: 0 }),
      ErrorCodes.POST_CONCURRENT_MODIFICATION, 409,
    );
    const post = await createPostWith({ slug: "missing-rel" });
    await expectError(
      postRepository.create({
        authorId: authorId, title: "t", slug: "missing-cat", excerpt: "e", contentMd: "c",
        categoryId: "00000000-0000-4000-8000-0000000000bb", coverImageUrl: null, seoTitle: null,
        seoDescription: null, seoImageUrl: null, tagIds: [],
      }),
      ErrorCodes.CATEGORY_NOT_FOUND, 404,
    );
    await expectError(
      postRepository.create({
        authorId: authorId, title: "t", slug: "missing-tag", excerpt: "e", contentMd: "c",
        categoryId: null, coverImageUrl: null, seoTitle: null, seoDescription: null, seoImageUrl: null,
        tagIds: ["00000000-0000-4000-8000-0000000000cc"],
      }),
      ErrorCodes.TAG_NOT_FOUND, 404,
    );
    expect(await prisma.post.count({ where: { slug: { in: ["missing-cat", "missing-tag"] } } })).toBe(0);
    // the successful create with a live category bumps its epoch exactly once
    const cat = await createCategory("存在", "exists");
    await postRepository.create({
      authorId: authorId, title: "t", slug: "live-cat", excerpt: "e", contentMd: "c",
      categoryId: cat.id, coverImageUrl: null, seoTitle: null, seoDescription: null, seoImageUrl: null, tagIds: [],
    });
    expect((await prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true } })).version).toBe(1);
  });
});

describe("delete-transaction second-half failure rolls back everything (test-DB injected faults)", () => {
  it("category: a fault DURING the unlink (after the version guard) restores guard, links, and post versions", async () => {
    const cat = await createCategory("后半段", "second-half-cat");
    const post = await createPostWith({ slug: "sh-cat-post", categoryId: cat.id });
    const before = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true, categoryId: true } });
    const catBefore = await prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true, updatedAt: true } });
    await pgPool.query(`CREATE OR REPLACE FUNCTION leon_test_fail_unlink() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'test-injected second-half failure'; END $$ LANGUAGE plpgsql`);
    await pgPool.query(`CREATE TRIGGER leon_test_fail_unlink BEFORE UPDATE ON posts
      FOR EACH ROW WHEN (OLD.category_id IS NOT NULL AND NEW.category_id IS NULL)
      EXECUTE FUNCTION leon_test_fail_unlink()`);
    try {
      const fresh = (await categoryService.listAdminCategories()).find((c) => c.id === cat.id)!;
      // The injected fault is a GENERIC database error — FR-21/AC-21-04: it
      // must keep the real internal path (raw Prisma error, no business code).
      await expect(categoryService.deleteCategory(cat.id, fresh.version)).rejects.toThrow("test-injected second-half failure");
      // FULL rollback: guard bump gone, link intact, post version untouched.
      const catAfter = await prisma.category.findUniqueOrThrow({ where: { id: cat.id }, select: { version: true, updatedAt: true } });
      expect(catAfter.version).toBe(catBefore.version);
      expect(catAfter.updatedAt.getTime()).toBe(catBefore.updatedAt.getTime());
      const postAfter = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true, categoryId: true } });
      expect(postAfter.version).toBe(before.version);
      expect(postAfter.categoryId).toBe(cat.id);
    } finally {
      await pgPool.query("DROP TRIGGER IF EXISTS leon_test_fail_unlink ON posts");
      await pgPool.query("DROP FUNCTION IF EXISTS leon_test_fail_unlink()");
    }
  });

  it("tag: a fault at the FINAL tag delete (after guard, post bumps, and link removal) restores all of it", async () => {
    const tag = await createTag("后半段标签", "second-half-tag");
    const post = await createPostWith({ slug: "sh-tag-post", tagIds: [tag.id] });
    const postBefore = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true, updatedAt: true } });
    const tagBefore = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true, updatedAt: true } });
    await pgPool.query(`CREATE OR REPLACE FUNCTION leon_test_fail_tag_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'test-injected second-half failure'; END $$ LANGUAGE plpgsql`);
    await pgPool.query(`CREATE TRIGGER leon_test_fail_tag_delete BEFORE DELETE ON tags
      FOR EACH ROW EXECUTE FUNCTION leon_test_fail_tag_delete()`);
    try {
      const fresh = (await tagService.listAdminTags()).find((t) => t.id === tag.id)!;
      await expect(tagService.deleteTag(tag.id, fresh.version)).rejects.toThrow("test-injected second-half failure");
      const tagAfter = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true, updatedAt: true } });
      expect(tagAfter.version).toBe(tagBefore.version);
      expect(tagAfter.updatedAt.getTime()).toBe(tagBefore.updatedAt.getTime());
      const postAfter = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true, updatedAt: true } });
      expect(postAfter.version).toBe(postBefore.version);
      expect(postAfter.updatedAt.getTime()).toBe(postBefore.updatedAt.getTime());
      expect(await prisma.postTag.count({ where: { tagId: tag.id } })).toBe(1);
    } finally {
      await pgPool.query("DROP TRIGGER IF EXISTS leon_test_fail_tag_delete ON tags");
      await pgPool.query("DROP FUNCTION IF EXISTS leon_test_fail_tag_delete()");
    }
  });
});

describe("real two-connection / two-transaction bounded interleavings (FR-21 / AC-05-05)", () => {
  async function waitForLockWaiters(minWaiters: number, timeoutMs = 6000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      // Scoped to THIS test database so sessions in other databases can
      // never satisfy the barrier; our own backend is excluded as well.
      const { rows } = await pgPool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND state = 'active'
            AND datname = current_database()
            AND pid <> pg_backend_pid()`,
      );
      if (rows[0].n >= minWaiters) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${minWaiters} lock waiter(s)`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function withRawHold<T>(hold: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pgPool.connect();
    try {
      return await hold(client);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }

  it("TAG, delete commits first: the parked production write gets relation-missing 404 and rolls back completely", async () => {
    const tag = await createTag("并发标签", "concur-tag");
    const post = await createPostWith({ slug: "concur-write" }); // no tags: the write ADDS the tag → its bump is the parking point

    await withRawHold(async (c1) => {
      // C1 mirrors deleteAndUnlink's exact statement protocol, split at the
      // hold point: guard bump first (this is the taxonomy lock), then hold.
      await c1.query("BEGIN");
      await c1.query("UPDATE tags SET version = version + 1, updated_at = now() WHERE id = $1", [tag.id]);

      // Production write: service pre-checks already passed (the uncommitted
      // delete is invisible to them); its in-transaction bump parks on C1.
      const writePromise = postRepository.updateInTransaction(post.id, {
        tagIds: [tag.id],
        expectedVersion: post.version,
      });
      await waitForLockWaiters(1);

      // The delete finishes and COMMITS first (unlink posts, remove links,
      // delete the row) — same order as deleteAndUnlink.
      await c1.query("UPDATE posts SET version = version + 1, updated_at = now() WHERE id IN (SELECT post_id FROM post_tags WHERE tag_id = $1)", [tag.id]);
      await c1.query("DELETE FROM post_tags WHERE tag_id = $1", [tag.id]);
      await c1.query("DELETE FROM tags WHERE id = $1", [tag.id]);
      await c1.query("COMMIT");

      await expectError(writePromise, ErrorCodes.TAG_NOT_FOUND, 404);
    });

    // Full rollback of the parked write: post untouched, no link resurrected.
    const after = await postRepository.findAdminById(post.id);
    expect(after!.version).toBe(post.version);
    expect(after!.postTags).toHaveLength(0);
    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
  });

  it("CATEGORY, delete commits first: a parked production createDraft gets relation-missing 404 and creates nothing", async () => {
    const cat = await createCategory("并发分类", "concur-cat");

    await withRawHold(async (c1) => {
      await c1.query("BEGIN");
      await c1.query("UPDATE categories SET version = version + 1, updated_at = now() WHERE id = $1", [cat.id]);

      const createPromise = postCommandService.createDraft({
        actorId: authorId,
        input: { title: "并发建稿", slug: "concur-create", excerpt: "e", contentMd: "c", categoryId: cat.id },
      });
      await waitForLockWaiters(1);

      await c1.query("UPDATE posts SET category_id = NULL, version = version + 1, updated_at = now() WHERE category_id = $1", [cat.id]);
      await c1.query("DELETE FROM categories WHERE id = $1", [cat.id]);
      await c1.query("COMMIT");

      await expectError(createPromise, ErrorCodes.CATEGORY_NOT_FOUND, 404);
    });

    expect(await prisma.post.count({ where: { slug: "concur-create" } })).toBe(0);
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
  });

  it("write commits first: a stale delete confirmation parks on the write's tag lock, then conflicts 409", async () => {
    const tag = await createTag("写先提交", "write-first");
    const post = await createPostWith({ slug: "write-first-post", tagIds: [tag.id] });
    const confirmedVersion = (await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } })).version;

    await withRawHold(async (c1) => {
      // Park the PRODUCTION write mid-transaction by holding the post row —
      // its taxonomy bump has already run and holds the tag lock.
      await c1.query("BEGIN");
      await c1.query("SELECT id FROM posts WHERE id = $1 FOR UPDATE", [post.id]);

      const writePromise = postRepository.updateInTransaction(post.id, {
        tagIds: [],
        expectedVersion: post.version,
      });
      await waitForLockWaiters(1);

      // Stale confirmation passes its (unlocked) pre-read — the write's bump
      // is still uncommitted and invisible — then parks on the tag row.
      const deletePromise = tagService.deleteTag(tag.id, confirmedVersion);
      await waitForLockWaiters(2);

      await c1.query("COMMIT"); // release the post row → the write commits first
      await writePromise; // succeeds: tag bumped, link removed, post v+1
      await expectError(deletePromise, ErrorCodes.TAG_CONCURRENT_MODIFICATION, 409);
    });

    const after = await prisma.$transaction([
      prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } }),
      prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true } }),
      prisma.postTag.count({ where: { tagId: tag.id } }),
    ]);
    expect(after[0].version).toBe(confirmedVersion + 1); // exactly one epoch from the committed write
    expect(after[1].version).toBe(post.version + 1);
    expect(after[2]).toBe(0);
  });

  it("two concurrent deletes of the same tag: exactly ONE succeeds, the other conflicts, the post is unlinked exactly once", async () => {
    const tag = await createTag("双删", "double-del");
    const post = await createPostWith({ slug: "double-del-post", tagIds: [tag.id] });
    const confirmedVersion = (await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } })).version;

    await withRawHold(async (c1) => {
      // Pre-barrier: both deletes park at their guard bump on this row lock.
      await c1.query("BEGIN");
      await c1.query("SELECT id FROM tags WHERE id = $1 FOR UPDATE", [tag.id]);

      const deletes = [
        tagService.deleteTag(tag.id, confirmedVersion),
        tagService.deleteTag(tag.id, confirmedVersion),
      ];
      await waitForLockWaiters(2);
      await c1.query("ROLLBACK"); // release — the two guards now race for the row

      const outcomes = await Promise.allSettled(deletes);
      const rejected = outcomes.filter((o) => o.status === "rejected");
      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reason = (rejected[0] as PromiseRejectedResult).reason as AppError;
      expect(reason).toBeInstanceOf(AppError);
      // AC-05-08: the losing delete reports "missing OR changed" — never a
      // second success. (The winner may have already removed the row.)
      expect([ErrorCodes.TAG_CONCURRENT_MODIFICATION, ErrorCodes.TAG_NOT_FOUND]).toContain(reason.code);
    });

    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    const postAfter = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, select: { version: true } });
    expect(postAfter.version).toBe(post.version + 1); // unlinked + bumped EXACTLY once
    expect(await prisma.postTag.count({ where: { tagId: tag.id } })).toBe(0);
  });

  it("PRODUCTION delete × PRODUCTION write (delete commits first): advisory-lock trigger parks the real guard, the real write parks on the row lock, then 404 + rollback", async () => {
    const ADVISORY_KEY = 778899;
    const tag = await createTag("生产交叠", "prod-overlap");
    const post = await createPostWith({ slug: "prod-overlap-post" }); // untagged: the write ADDS this tag
    const confirmedVersion = (await prisma.tag.findUniqueOrThrow({ where: { id: tag.id }, select: { version: true } })).version;

    // Test-DB-only parking brake: the production guard's row UPDATE runs this
    // AFTER UPDATE trigger, which waits on an advisory lock ONLY WHILE the
    // test holds it. No production error-handling is modified.
    await pgPool.query(`CREATE OR REPLACE FUNCTION leon_test_park_tag_guard() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_lock(${ADVISORY_KEY});
        PERFORM pg_advisory_unlock(${ADVISORY_KEY});
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await pgPool.query(`CREATE TRIGGER leon_test_park_tag_guard AFTER UPDATE ON tags
      FOR EACH ROW EXECUTE FUNCTION leon_test_park_tag_guard()`);

    const c1 = await pgPool.connect();
    let deletePromise: Promise<unknown> | null = null;
    let writePromise: Promise<unknown> | null = null;
    try {
      await c1.query("SELECT pg_advisory_lock($1)", [ADVISORY_KEY]);

      // PRODUCTION delete: parks INSIDE its guard statement (after the row
      // lock is taken) at the trigger's advisory wait.
      deletePromise = tagService.deleteTag(tag.id, confirmedVersion);
      await waitForLockWaiters(1);

      // PRODUCTION write: service checks passed, in-transaction bump parks on
      // the guard's row lock.
      writePromise = postRepository.updateInTransaction(post.id, {
        tagIds: [tag.id],
        expectedVersion: post.version,
      });
      await waitForLockWaiters(2);

      // Release the brake: the delete finishes (guard → unlink → delete) and
      // COMMITS first; the parked write then finds the tag gone.
      await c1.query("SELECT pg_advisory_unlock($1)", [ADVISORY_KEY]);
      await deletePromise;

      await expectError(writePromise, ErrorCodes.TAG_NOT_FOUND, 404);
    } finally {
      // Bounded cleanup: even on a failed wait, unblock everything so no
      // orphan transaction outlives the test.
      await c1.query("SELECT pg_advisory_unlock($1)", [ADVISORY_KEY]).catch(() => undefined);
      await c1.query("ROLLBACK").catch(() => undefined);
      c1.release();
      await Promise.allSettled([deletePromise, writePromise].filter(Boolean) as Promise<unknown>[]);
      await pgPool.query("DROP TRIGGER IF EXISTS leon_test_park_tag_guard ON tags");
      await pgPool.query("DROP FUNCTION IF EXISTS leon_test_park_tag_guard()");
    }

    // Delete committed; the parked write rolled back completely.
    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    const after = await postRepository.findAdminById(post.id);
    expect(after!.version).toBe(post.version);
    expect(after!.postTags).toHaveLength(0);
  });

  it("reverse tag orders under genuinely interleaved multi-tag writes: no deadlock, both commit (sorted lock order)", async () => {
    const tagA = await createTag("锁序甲", "lock-a");
    const tagB = await createTag("锁序乙", "lock-b");
    const p1 = await createPostWith({ slug: "lock-p1" }); // will ADD both tags (reverse input order)
    const p2 = await createPostWith({ slug: "lock-p2", tagIds: [tagA.id, tagB.id] }); // will REMOVE both

    await withRawHold(async (c1) => {
      await c1.query("BEGIN");
      await c1.query("SELECT id FROM posts WHERE id = $1 FOR UPDATE", [p1.id]);

      const w1 = postRepository.updateInTransaction(p1.id, {
        tagIds: [tagB.id, tagA.id], // deliberately reversed input order
        expectedVersion: p1.version,
      });
      await waitForLockWaiters(1); // w1 holds both tag locks, parked on the post row

      const w2 = postRepository.updateInTransaction(p2.id, {
        tagIds: [],
        expectedVersion: p2.version,
      });
      await waitForLockWaiters(2); // w2 parks on the first tag lock — same acquisition ORDER as w1

      await c1.query("COMMIT");
      await w1;
      await w2;
    });

    // Both committed: p1 links both tags, p2 links none; every epoch +1.
    const [a, b, r1, r2] = await prisma.$transaction([
      prisma.tag.findUniqueOrThrow({ where: { id: tagA.id }, select: { version: true } }),
      prisma.tag.findUniqueOrThrow({ where: { id: tagB.id }, select: { version: true } }),
      prisma.postTag.findMany({ where: { postId: p1.id }, select: { tagId: true } }),
      prisma.postTag.findMany({ where: { postId: p2.id }, select: { tagId: true } }),
    ]);
    // creation of p2 bumped both tags once; w1 entering + w2 leaving = 3 each
    expect(a.version).toBe(3);
    expect(b.version).toBe(3);
    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(0);
  });
});
