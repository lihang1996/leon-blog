import { NextRequest } from "next/server";
import { postQueryService, postCommandService, updatePostSchema } from "@/modules/post";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOrigin, assertSameOriginJson } from "@/lib/api/same-origin";
import { assertAdminUuid } from "@/lib/api/admin-id";
import { parseExpectedVersion } from "@/lib/api/expected-version";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess, apiNoContent } from "@/lib/api/api-response";
import { buildInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { applyInvalidation, PUBLIC_CACHE_STATUS_HEADER } from "@/lib/api/invalidate";
import { ErrorCodes, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger/logger";

/** GET /api/v1/admin/posts/{id} — post edit data (PRD §6.3). Admin only. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const post = await postQueryService.getAdminPost(id);
    // Route through handleApiError so a missing post yields the same standard
    // error envelope as every other 4xx path (FIND-208 fix).
    if (!post) throw notFound(ErrorCodes.POST_NOT_FOUND, "文章不存在");
    return apiSuccess(post, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** PATCH /api/v1/admin/posts/{id} — update content or status (PRD §6.3). Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const input = updatePostSchema.parse(await readAdminJsonBody(request));
    const { post, changeSet } = await postCommandService.updatePost({
      postId: id,
      actorId: admin.id,
      input,
    });

    // Invalidate public cache ONLY after the DB transaction committed; the
    // write stays successful even when invalidation fails — the header tells
    // the client which one happened (FR-03 / delivery §4.2).
    const cacheStatus = await applyInvalidation(
      buildInvalidationPlan(changeSet),
      ctx.requestId,
      { kind: "post", id: post.id, version: post.version },
    );
    logger.info("admin.post.updated", { requestId: ctx.requestId, postId: post.id, status: post.status, cacheStatus });
    return apiSuccess(post, ctx, 200, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/**
 * DELETE /api/v1/admin/posts/{id} — hard-delete a DRAFT or ARCHIVED post
 * (PUBLISHED must be archived first). A bodyless DELETE has no Content-Type
 * to validate, so only the same-origin CSRF check applies (browsers can't
 * set Origin on cross-site deletes).
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const version = parseExpectedVersion(request.headers.get("if-match"));
    const changeSet = await postCommandService.deleteDraft({ postId: id, version });
    // An ever-published archived post leaves public pages under its old slug —
    // invalidate ONLY after the delete committed (same contract as PATCH). The
    // 204 keeps the same header contract so clients can warn + retry the
    // refresh without repeating the delete (FR-03.8).
    const cacheStatus = await applyInvalidation(
      buildInvalidationPlan(changeSet),
      ctx.requestId,
      { kind: "post", id, version },
    );
    logger.info("admin.post.deleted", { requestId: ctx.requestId, postId: id, cacheStatus });
    return apiNoContent(ctx, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
