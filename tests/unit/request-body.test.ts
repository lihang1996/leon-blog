import { describe, expect, it } from "vitest";
import { MAX_ADMIN_JSON_BODY_BYTES, readAdminJsonBody } from "@/lib/api/request-body";
import { AppError, ErrorCodes } from "@/lib/errors";

function jsonRequest(body: string, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/v1/admin/posts", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body,
  });
}

describe("readAdminJsonBody", () => {
  it("parses a legal JSON object", async () => {
    const data = await readAdminJsonBody(jsonRequest(JSON.stringify({ title: "ok" })));
    expect(data).toEqual({ title: "ok" });
  });

  it("returns 413 PAYLOAD_TOO_LARGE when Content-Length exceeds the cap", async () => {
    try {
      await readAdminJsonBody(
        jsonRequest("{}", { "content-length": String(MAX_ADMIN_JSON_BODY_BYTES + 1) }),
      );
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.PAYLOAD_TOO_LARGE);
      expect((error as AppError).status).toBe(413);
    }
  });

  it("returns 413 when the actual body exceeds the cap", async () => {
    const oversized = JSON.stringify({ contentMd: "a".repeat(MAX_ADMIN_JSON_BODY_BYTES) });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(MAX_ADMIN_JSON_BODY_BYTES);
    try {
      await readAdminJsonBody(jsonRequest(oversized));
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(413);
    }
  });

  it("throws SyntaxError for illegal JSON inside the cap", async () => {
    await expect(readAdminJsonBody(jsonRequest("{ not json"))).rejects.toBeInstanceOf(SyntaxError);
  });

  it("allows a legal max-length article JSON (200 KiB contentMd)", async () => {
    const body = JSON.stringify({
      title: "合法文章",
      excerpt: "摘要",
      contentMd: "a".repeat(200 * 1024),
    });
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_ADMIN_JSON_BODY_BYTES);
    const data = (await readAdminJsonBody(jsonRequest(body))) as { contentMd: string };
    expect(data.contentMd).toHaveLength(200 * 1024);
  });
});
