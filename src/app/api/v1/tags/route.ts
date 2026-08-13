import { NextRequest } from "next/server";
import { tagService } from "@/modules/tag";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess } from "@/lib/api/api-response";

/** GET /api/v1/tags — tags attached to published posts (PRD §6.1). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const tags = await tagService.listPublicTags();
    return apiSuccess(tags, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
