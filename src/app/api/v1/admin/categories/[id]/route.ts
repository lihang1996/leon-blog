import { NextRequest } from "next/server";
import { categoryService, updateCategorySchema } from "@/modules/category";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOrigin, assertSameOriginJson } from "@/lib/api/same-origin";
import { assertAdminUuid } from "@/lib/api/admin-id";
import { parseExpectedVersion } from "@/lib/api/expected-version";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess, apiNoContent } from "@/lib/api/api-response";
import { buildCategoryInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { applyInvalidation, PUBLIC_CACHE_STATUS_HEADER } from "@/lib/api/invalidate";
import { logger } from "@/lib/logger/logger";

/** PATCH /api/v1/admin/categories/{id} (PRD §6.4). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { id } = await context.params;
    assertAdminUuid(id);
    const input = updateCategorySchema.parse(await readAdminJsonBody(request));
    const { category, changeSet } = await categoryService.updateCategory(id, input);
    const cacheStatus = await applyInvalidation(
      buildCategoryInvalidationPlan(changeSet),
      ctx.requestId,
      { kind: "category", id: category.id },
    );
    logger.info("admin.category.updated", { requestId: ctx.requestId, categoryId: category.id, cacheStatus });
    return apiSuccess(category, ctx, 200, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** DELETE /api/v1/admin/categories/{id} — posts keep, category_id set null (PRD §6.4). */
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
    const { changeSet, affectedPostCount } = await categoryService.deleteCategory(id, version);
    const cacheStatus = await applyInvalidation(
      buildCategoryInvalidationPlan(changeSet),
      ctx.requestId,
      { kind: "category", id },
    );
    logger.info("admin.category.deleted", { requestId: ctx.requestId, categoryId: id, affectedPostCount, cacheStatus });
    return apiNoContent(ctx, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
