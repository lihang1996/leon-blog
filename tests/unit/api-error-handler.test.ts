import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { handleApiError } from "@/lib/api/api-error-handler";
import { AppError, ErrorCodes } from "@/lib/errors";
import type { RequestContext } from "@/lib/api/request-context";

function ctx(id = "req-1"): RequestContext {
  return { requestId: id, method: "POST", path: "/api/v1/admin/posts", startedAt: 0 };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleApiError", () => {
  it("returns a generic 500 and never echoes the raw error message to the client", async () => {
    const secret = "postgresql://user:super-secret@db.example.com:5432/leon_blog";
    const error = new Error(`Unique constraint failed on the fields: (\`slug\`); ${secret}`);
    const res = handleApiError(error, ctx());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(body.error.message).toBe("服务器内部错误");
    expect(body.error.requestId).toBe("req-1");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("db.example.com");
  });

  it("redacts credentials from the logged error message (not just the client response)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "postgresql://user:super-secret@db.example.com:5432/leon_blog";
    handleApiError(new Error(`boom ${secret}`), ctx("req-log"));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String((errorSpy.mock.calls[0] as unknown[])[0]);
    expect(logged).toContain("api.unhandled");
    expect(logged).not.toContain("super-secret");
    expect(logged).not.toContain("db.example.com");
    expect(logged).toContain("boom ***");
  });

  it("maps AppError to its status/code and keeps business details", async () => {
    const res = handleApiError(new AppError(ErrorCodes.POST_SLUG_EXISTS, 409, "文章 slug 已存在"), ctx("req-2"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.POST_SLUG_EXISTS);
  });

  it("does not leak a 5xx AppError message to the client and redacts it from logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "postgresql://user:super-secret@db.example.com:5432/leon_blog";
    const res = handleApiError(new AppError(ErrorCodes.INTERNAL_ERROR, 500, `boom ${secret}`), ctx("req-5xx"));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.message).toBe("服务器内部错误");
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("db.example.com");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String((errorSpy.mock.calls[0] as unknown[])[0]);
    expect(logged).toContain("api.error");
    expect(logged).not.toContain("super-secret");
    expect(logged).toContain("boom ***");
  });

  it("maps a SyntaxError (malformed JSON body) to a 400 client error", async () => {
    const res = handleApiError(new SyntaxError("Expected property name or '}' in JSON at position 1"), ctx("req-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(body.error.message).toBe("请求体不是合法的 JSON");
  });

  it("maps ZodError to a 422 VALIDATION_FAILED envelope", async () => {
    const parsed = z.object({ title: z.string() }).safeParse({});
    expect(parsed.success).toBe(false);
    const res = handleApiError(parsed.error, ctx("req-3"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });
});
