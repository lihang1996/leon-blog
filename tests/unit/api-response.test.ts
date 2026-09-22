import { describe, expect, it } from "vitest";
import { apiCreated, apiNoContent, apiPaginated, apiSuccess } from "@/lib/api/api-response";
import { handleApiError } from "@/lib/api/api-error-handler";
import { AppError, ErrorCodes } from "@/lib/errors";

const ctx = { requestId: "request-test", method: "GET", path: "/api/v1/posts", startedAt: 0 };

describe("REST response caching", () => {
  it("does not cache success, pagination, writes or errors in shared HTTP caches", () => {
    const responses = [
      apiSuccess({ id: "one" }, ctx),
      apiCreated({ id: "one" }, ctx),
      apiPaginated([], { page: 1, pageSize: 10, total: 0, totalPages: 1 }, ctx),
      apiNoContent(ctx),
      handleApiError(new AppError(ErrorCodes.AUTH_REQUIRED, 401, "请登录"), ctx),
    ];
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBe(ctx.requestId);
    }
  });
});
