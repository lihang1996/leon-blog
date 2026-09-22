import { NextRequest } from "next/server";
import { tagService, updateTagSchema } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOrigin, assertSameOriginJson } from "@/lib/api/same-origin";
import { assertAdminUuid } from "@/lib/api/admin-id";
import { parseExpectedVersion } from "@/lib/api/expected-version";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess, apiNoContent } from "@/lib/api/api-response";
import { buildTagInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { applyInvalidation } from "@/lib/api/invalidate";
import { logger } from "@/lib/logger/logger";

/** PATCH /api/v1/admin/tags/{id} (PRD §6.5). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const input = updateTagSchema.parse(await readAdminJsonBody(request));
    const { tag, changeSet } = await tagService.updateTag(id, input);
    await applyInvalidation(buildTagInvalidationPlan(changeSet), ctx.requestId);
    logger.info("admin.tag.updated", { requestId: ctx.requestId, tagId: tag.id });
    return apiSuccess(tag, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** DELETE /api/v1/admin/tags/{id} — only the post↔tag links are removed (PRD §6.5). */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    // Bodyless DELETE: same-origin CSRF check only (no Content-Type to validate).
    assertSameOrigin(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const version = parseExpectedVersion(request.headers.get("if-match"));
    const { changeSet, linkedPostCount } = await tagService.deleteTag(id, version);
    await applyInvalidation(buildTagInvalidationPlan(changeSet), ctx.requestId);
    logger.info("admin.tag.deleted", { requestId: ctx.requestId, tagId: id, linkedPostCount });
    return apiNoContent(ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
