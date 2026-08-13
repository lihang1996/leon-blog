import { NextRequest } from "next/server";
import { categoryService } from "@/modules/category";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess } from "@/lib/api/api-response";

/** GET /api/v1/categories — categories that have published posts (PRD §6.1). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const categories = await categoryService.listPublicCategories();
    return apiSuccess(categories, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
