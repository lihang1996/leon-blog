import "server-only";
import {
  canTransition,
  canHardDelete,
  generateSlug,
  isSlugEditable,
  validateSlug,
  validatePublish,
} from "./post-policy";
import { postRepository, type AdminPostDetailRow } from "./post.repository";
import { categoryRepository } from "@/modules/category/category.repository";
import { tagRepository } from "@/modules/tag/tag.repository";
import { isAllowedImageUrl } from "@/lib/markdown/markdown-policy";
import { getAllowedImageHosts } from "@/lib/env";
import { dedupe, type PostChangeSet } from "@/lib/cache/cache-invalidation";
import { ErrorCodes, conflict, notFound, unprocessable } from "@/lib/errors";
import type { CreatePostInput, PostContentUpdate, PostStatusAction } from "./post.schemas";
import type { AdminPostDTO } from "./post.dto";

/**
 * Post command service (architecture §7 / §8.3 / §13.3).
 *
 * Every write goes through here: drafts, content updates, the
 * DRAFT → PUBLISHED → ARCHIVED → DRAFT state machine, slug locking, publish
 * readiness and the single-transaction post+tags update. Each method returns a
 * PostChangeSet so the Route Handler can run cache invalidation ONLY after the
 * DB commit succeeds.
 */

function toAdminDetail(row: AdminPostDetailRow): AdminPostDTO {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    contentMd: row.contentMd,
    coverImageUrl: row.coverImageUrl,
    status: row.status,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoImageUrl: row.seoImageUrl,
    categoryId: row.categoryId,
    tagIds: row.postTags.map((pt) => pt.tagId),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function isImageUrlAllowed(url: string): boolean {
  return isAllowedImageUrl(url, new Set(getAllowedImageHosts()));
}

async function assertTagsExist(tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const map = await tagRepository.findSlugsByIds(tagIds);
  if (map.size !== tagIds.length) {
    throw notFound(ErrorCodes.TAG_NOT_FOUND, "存在不存在的标签");
  }
}

async function assertCategoryExists(categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const exists = await categoryRepository.findById(categoryId);
  if (!exists) throw notFound(ErrorCodes.CATEGORY_NOT_FOUND, "分类不存在");
}

export const postCommandService = {
  async createDraft(args: { actorId: string; input: CreatePostInput }): Promise<{
    post: AdminPostDTO;
    changeSet: PostChangeSet;
  }> {
    const title = args.input.title.trim();
    let slug = (args.input.slug ?? "").trim().toLowerCase();
    if (!slug) slug = generateSlug(title);

    const slugIssues = validateSlug(slug);
    if (slugIssues.length > 0) {
      throw unprocessable(ErrorCodes.VALIDATION_FAILED, slugIssues[0]!.message, slugIssues);
    }
    if (await postRepository.slugExists(slug)) {
      throw conflict(ErrorCodes.POST_SLUG_EXISTS, "文章 slug 已存在");
    }

    // Normalize UUID case before dedupe/comparison: the same tag id written in
    // different cases is one identity, otherwise `assertTagsExist` (which
    // compares by distinct DB rows) would misreport "存在不存在的标签".
    const tagIds = dedupe((args.input.tagIds ?? []).map((id) => id.toLowerCase()));
    const categoryId = args.input.categoryId ?? null;
    await assertTagsExist(tagIds);
    await assertCategoryExists(categoryId);

    const row = await postRepository.create({
      authorId: args.actorId,
      title,
      slug,
      excerpt: args.input.excerpt.trim(),
      contentMd: args.input.contentMd,
      categoryId,
      coverImageUrl: args.input.coverImageUrl ?? null,
      seoTitle: args.input.seoTitle ?? null,
      seoDescription: args.input.seoDescription ?? null,
      seoImageUrl: args.input.seoImageUrl ?? null,
      tagIds,
    });

    // The committed row already carries the associations (category + tag
    // relations) the invalidation plan needs — no extra post-commit query
    // can lose this result (FR-03 / AC-03-02).
    return {
      post: toAdminDetail(row),
      changeSet: {
        oldSlug: null,
        newSlug: slug,
        oldCategorySlug: null,
        newCategorySlug: row.category?.slug ?? null,
        oldTagSlugs: [],
        newTagSlugs: row.postTags.map((pt) => pt.tag.slug),
      },
    };
  },

  async updatePost(args: {
    postId: string;
    actorId: string;
    input: { content?: PostContentUpdate; action?: PostStatusAction; version: number };
  }): Promise<{ post: AdminPostDTO; changeSet: PostChangeSet }> {
    const existing = await postRepository.findAdminById(args.postId);
    if (!existing) throw notFound(ErrorCodes.POST_NOT_FOUND, "文章不存在");
    if (existing.version !== args.input.version) {
      throw conflict(ErrorCodes.POST_CONCURRENT_MODIFICATION, "文章已被其他操作修改，请刷新后重试");
    }

    // The loaded row already carries the OLD associations (category + tag
    // relations) for the invalidation plan — no separate lookups.
    const oldCategorySlug = existing.category?.slug ?? null;
    const oldTagSlugs = existing.postTags.map((pt) => pt.tag.slug);

    const content = args.input.content;
    let status = existing.status;

    // ---- State machine ------------------------------------------------------
    if (args.input.action === "publish") {
      if (!canTransition(status, "PUBLISHED")) {
        throw unprocessable(ErrorCodes.INVALID_POST_TRANSITION, "当前状态不能发布");
      }
      status = "PUBLISHED";
    } else if (args.input.action === "archive") {
      if (!canTransition(status, "ARCHIVED")) {
        throw unprocessable(ErrorCodes.INVALID_POST_TRANSITION, "只有已发布文章可以下线");
      }
      status = "ARCHIVED";
    } else if (args.input.action === "restore") {
      if (!canTransition(status, "DRAFT")) {
        throw unprocessable(ErrorCodes.INVALID_POST_TRANSITION, "只有已归档文章可以恢复为草稿");
      }
      status = "DRAFT";
    }

    // ---- Slug resolution (locked once ever published) -----------------------
    let slug = existing.slug;
    if (content?.slug) {
      const requestedSlug = content.slug.trim().toLowerCase();
      if (!isSlugEditable(existing.publishedAt) && requestedSlug !== existing.slug) {
        throw unprocessable(ErrorCodes.INVALID_POST_TRANSITION, "文章发布后 slug 不可修改");
      }
      slug = requestedSlug;
      const slugIssues = validateSlug(slug);
      if (slugIssues.length > 0) {
        throw unprocessable(ErrorCodes.VALIDATION_FAILED, slugIssues[0]!.message, slugIssues);
      }
      if (await postRepository.slugExists(slug, existing.id)) {
        throw conflict(ErrorCodes.POST_SLUG_EXISTS, "文章 slug 已存在");
      }
    }

    // ---- Category / tags ----------------------------------------------------
    const categoryId = content?.categoryId !== undefined ? (content.categoryId ?? null) : existing.categoryId;
    await assertCategoryExists(categoryId);

    const tagIds = content?.tagIds !== undefined
      ? dedupe(content.tagIds.map((id) => id.toLowerCase()))
      : existing.postTags.map((pt) => pt.tagId);
    await assertTagsExist(tagIds);

    // ---- Publish readiness --------------------------------------------------
    if (status === "PUBLISHED") {
      const issues = validatePublish({
        title: content?.title ?? existing.title,
        slug,
        excerpt: content?.excerpt ?? existing.excerpt,
        contentMd: content?.contentMd ?? existing.contentMd,
        tagCount: tagIds.length,
        seoTitle: content?.seoTitle !== undefined ? content.seoTitle : existing.seoTitle,
        seoDescription: content?.seoDescription !== undefined ? content.seoDescription : existing.seoDescription,
        coverImageUrl: content?.coverImageUrl !== undefined ? content.coverImageUrl : existing.coverImageUrl,
        seoImageUrl: content?.seoImageUrl !== undefined ? content.seoImageUrl : existing.seoImageUrl,
        isAuthorActive: await postRepository.isAuthorActive(existing.authorId),
        isImageUrlAllowed,
      });
      if (issues.length > 0) {
        throw unprocessable(ErrorCodes.POST_NOT_READY, issues[0]!.message, issues);
      }
    }

    const publishedAt = status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt;

    const row = await postRepository.updateInTransaction(existing.id, {
      expectedVersion: args.input.version,
      ...(content?.title !== undefined ? { title: content.title.trim() } : {}),
      ...(slug !== existing.slug ? { slug } : {}),
      ...(content?.excerpt !== undefined ? { excerpt: content.excerpt.trim() } : {}),
      ...(content?.contentMd !== undefined ? { contentMd: content.contentMd } : {}),
      ...(content?.categoryId !== undefined ? { categoryId: content.categoryId ?? null } : {}),
      ...(content?.coverImageUrl !== undefined ? { coverImageUrl: content.coverImageUrl ?? null } : {}),
      ...(content?.seoTitle !== undefined ? { seoTitle: content.seoTitle ?? null } : {}),
      ...(content?.seoDescription !== undefined ? { seoDescription: content.seoDescription ?? null } : {}),
      ...(content?.seoImageUrl !== undefined ? { seoImageUrl: content.seoImageUrl ?? null } : {}),
      ...(content?.tagIds !== undefined ? { tagIds } : {}),
      ...(status !== existing.status ? { status } : {}),
      ...(publishedAt !== existing.publishedAt ? { publishedAt } : {}),
    });

    // Build the plan data from the transaction's returned row only: after the
    // commit is confirmed, no additional DB query may run (and fail) before
    // the caller learns the write succeeded (FR-03 / AC-03-02).
    return {
      post: toAdminDetail(row),
      changeSet: {
        oldSlug: existing.slug,
        newSlug: row.slug,
        oldCategorySlug,
        newCategorySlug: row.category?.slug ?? null,
        oldTagSlugs,
        newTagSlugs: row.postTags.map((pt) => pt.tag.slug),
      },
    };
  },

  /**
   * Hard-delete a DRAFT or ARCHIVED post. PUBLISHED must be archived first.
   * Optimistic-version + conditional delete keeps the check-then-act race
   * closed (a concurrent publish makes the delete a 409, not data loss).
   * Returns the pre-delete associations so the caller can invalidate the
   * PUBLIC caches (an ever-published archived post still has live public
   * pages under its old slug) — only meaningful after the delete committed.
   */
  async deleteDraft(args: { postId: string; version: number }): Promise<PostChangeSet> {
    const existing = await postRepository.findAdminById(args.postId);
    if (!existing) throw notFound(ErrorCodes.POST_NOT_FOUND, "文章不存在");
    if (existing.version !== args.version) {
      throw conflict(ErrorCodes.POST_CONCURRENT_MODIFICATION, "文章已被其他操作修改，请刷新后重试");
    }
    if (!canHardDelete(existing.status)) {
      throw unprocessable(ErrorCodes.INVALID_POST_TRANSITION, "已发布文章需先归档后才能删除");
    }
    const deleted = await postRepository.deleteConditionally(existing.id, args.version, [
      "DRAFT",
      "ARCHIVED",
    ]);
    if (!deleted) {
      throw conflict(ErrorCodes.POST_CONCURRENT_MODIFICATION, "文章状态已变化，请刷新后重试");
    }
    return {
      oldSlug: existing.slug,
      newSlug: "",
      oldCategorySlug: existing.category?.slug ?? null,
      newCategorySlug: null,
      oldTagSlugs: existing.postTags.map((pt) => pt.tag.slug),
      newTagSlugs: [],
    };
  },
};

export type PostCommandService = typeof postCommandService;
