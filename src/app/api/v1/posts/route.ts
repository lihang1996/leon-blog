import { NextRequest } from "next/server";
import { postQueryService } from "@/modules/post";
import { normalizePublicQuery } from "@/lib/public-query";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiPaginated } from "@/lib/api/api-response";

/** GET /api/v1/posts — published posts, paginated (PRD §6.1). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const { searchParams } = new URL(request.url);
    const query = normalizePublicQuery(Object.fromEntries(
      ["page", "pageSize", "q", "category", "tag", "sort"].map((key) => [key, searchParams.get(key) ?? undefined]),
    ));
    const result = await postQueryService.listPublishedPosts(query, {
      categorySlug: query.category || undefined,
      tagSlug: query.tag || undefined,
      keyword: query.q || undefined,
      sort: query.sort,
    });
    return apiPaginated(result.items, result.pagination, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
