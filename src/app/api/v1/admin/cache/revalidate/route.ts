import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOriginJson } from "@/lib/api/same-origin";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess } from "@/lib/api/api-response";
import { applyInvalidation, PUBLIC_CACHE_STATUS_HEADER } from "@/lib/api/invalidate";
import { buildFullPublicInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { cacheRevalidationFailed } from "@/lib/errors";
import { logger } from "@/lib/logger/logger";

/**
 * POST /api/v1/admin/cache/revalidate — standalone public-cache refresh
 * (FR-03 / delivery §4.2.3–§4.2.7).
 *
 * - JSON body must be exactly `{}`. It accepts NO caller-supplied paths,
 *   URLs, tags, or SQL: only this blog's fixed public cache tags/paths are
 *   invalidated, so the endpoint cannot be used as an arbitrary flush oracle.
 * - Reuses the admin guard set (same-origin + JSON + auth + body cap + logs).
 * - It never reads or writes business content and never bumps a version.
 * - All targets succeed → 200 `{ data: { cacheStatus: "invalidated" } }`;
 *   any target fails → 503 `CACHE_REVALIDATION_FAILED` with the request ID.
 *   This is a warning/retry channel: a failed refresh never rolls back or
 *   repeats the already-committed business write.
 */
const emptyBodySchema = z.strictObject({});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    emptyBodySchema.parse(await readAdminJsonBody(request));

    const cacheStatus = await applyInvalidation(
      buildFullPublicInvalidationPlan(),
      ctx.requestId,
      { kind: "cache-revalidate" },
    );
    if (cacheStatus !== "invalidated") {
      logger.error("admin.cache.revalidate_failed", { requestId: ctx.requestId });
      throw cacheRevalidationFailed();
    }
    logger.info("admin.cache.revalidated", { requestId: ctx.requestId });
    return apiSuccess({ cacheStatus }, ctx, 200, { [PUBLIC_CACHE_STATUS_HEADER]: cacheStatus });
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
