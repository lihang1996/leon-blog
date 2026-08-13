import { NextRequest } from "next/server";
import { z } from "zod";
import { postQueryService } from "@/modules/post";
import { normalizePageParams } from "@/lib/pagination";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiPaginated } from "@/lib/api/api-response";

/** GET /api/v1/search?q= — published posts by title/excerpt (PRD §6.1, §14). */
const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const { searchParams } = new URL(request.url);
    const parsed = searchQuerySchema.parse({ q: searchParams.get("q") });
    const params = normalizePageParams({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    const result = await postQueryService.searchPublishedPosts(parsed.q, params);
    return apiPaginated(result.items, result.pagination, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
