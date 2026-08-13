import { NextRequest } from "next/server";
import { postQueryService } from "@/modules/post";
import { normalizePageParams } from "@/lib/pagination";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiPaginated } from "@/lib/api/api-response";

/** GET /api/v1/categories/{slug}/posts — published posts in a category (PRD §6.1). */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const ctx = createRequestContext(request);
  try {
    const { slug } = await context.params;
    const { searchParams } = new URL(request.url);
    const params = normalizePageParams({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    const result = await postQueryService.listPostsByCategory(slug, params);
    return apiPaginated(result.items, result.pagination, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
