import { NextRequest } from "next/server";
import { tagService, createTagSchema } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOriginJson } from "@/lib/api/same-origin";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess, apiCreated } from "@/lib/api/api-response";
import { buildTagInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { applyInvalidation, PUBLIC_CACHE_STATUS_HEADER } from "@/lib/api/invalidate";
import { logger } from "@/lib/logger/logger";

/** GET /api/v1/admin/tags — admin list (PRD §6.5). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const tags = await tagService.listAdminTags();
    return apiSuccess(tags, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** POST /api/v1/admin/tags (PRD §6.5). */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const input = createTagSchema.parse(await readAdminJsonBody(request));
    const { tag, changeSet } = await tagService.createTag(input);
    const cacheStatus = await applyInvalidation(
      buildTagInvalidationPlan(changeSet),
      ctx.requestId,
      { kind: "tag", id: tag.id },
    );
    logger.info("admin.tag.created", { requestId: ctx.requestId, tagId: tag.id, cacheStatus });
    return apiCreated(tag, ctx, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
