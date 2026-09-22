import { NextRequest } from "next/server";
import { postQueryService, postCommandService, createPostSchema, postStatusQuerySchema } from "@/modules/post";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assertSameOriginJson } from "@/lib/api/same-origin";
import { readAdminJsonBody } from "@/lib/api/request-body";
import { normalizePageParams } from "@/lib/pagination";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiPaginated, apiCreated } from "@/lib/api/api-response";
import { logger } from "@/lib/logger/logger";

/** GET /api/v1/admin/posts — all-status posts (PRD §6.3). Admin only. */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const { searchParams } = new URL(request.url);
    const status = postStatusQuerySchema.parse({ status: searchParams.get("status") }).status;
    const params = normalizePageParams({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    const sort = searchParams.get("sort") === "published" ? "published" : "updated";
    const result = await postQueryService.listAdminPosts(params, status, sort);
    logger.info("admin.posts.list", { requestId: ctx.requestId, status, page: params.page });
    return apiPaginated(result.items, result.pagination, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}

/** POST /api/v1/admin/posts — create a draft (PRD §6.3). Admin only. */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    assertSameOriginJson(request);
    const admin = await requireAdmin();
    ctx.userId = admin.id;
    const input = createPostSchema.parse(await readAdminJsonBody(request));
    const { post } = await postCommandService.createDraft({ actorId: admin.id, input });
    logger.info("admin.post.created", { requestId: ctx.requestId, postId: post.id });
    return apiCreated(post, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
