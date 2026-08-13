import { NextRequest } from "next/server";
import { categoryService, createCategorySchema } from "@/modules/category";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOriginJson } from "@/lib/api/same-origin";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess, apiCreated } from "@/lib/api/api-response";
import { buildCategoryInvalidationPlan } from "@/lib/cache/cache-invalidation";
import { applyInvalidation } from "@/lib/api/invalidate";
import { logger } from "@/lib/logger/logger";

/** GET /api/v1/admin/categories — admin list (PRD §6.4). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const categories = await categoryService.listAdminCategories();
    return apiSuccess(categories, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** POST /api/v1/admin/categories (PRD §6.4). */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const input = createCategorySchema.parse(await request.json());
    const { category, changeSet } = await categoryService.createCategory(input);
    await applyInvalidation(buildCategoryInvalidationPlan(changeSet), ctx.requestId);
    logger.info("admin.category.created", { requestId: ctx.requestId, categoryId: category.id });
    return apiCreated(category, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
