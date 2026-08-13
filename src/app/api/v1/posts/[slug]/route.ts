import { NextRequest } from "next/server";
import { postQueryService } from "@/modules/post";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess } from "@/lib/api/api-response";
import { ErrorCodes, notFound } from "@/lib/errors";

/** GET /api/v1/posts/{slug} — published post detail; 404 otherwise (PRD §6.1). */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const ctx = createRequestContext(request);
  try {
    const { slug } = await context.params;
    const post = await postQueryService.getPublishedPostBySlug(slug);
    if (!post) throw notFound(ErrorCodes.POST_NOT_FOUND, "文章不存在");
    return apiSuccess(post, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
