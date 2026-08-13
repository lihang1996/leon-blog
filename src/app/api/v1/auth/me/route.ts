import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createRequestContext } from "@/lib/api/request-context";
import { handleApiError } from "@/lib/api/api-error-handler";
import { apiSuccess } from "@/lib/api/api-response";

/** GET /api/v1/auth/me — minimal current-admin DTO (architecture §10.1). */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);
  try {
    const admin = await requireAdmin();
    return apiSuccess({ id: admin.id, displayName: admin.displayName, email: admin.email }, ctx);
  } catch (error) {
    return handleApiError(error, ctx);
  }
}
