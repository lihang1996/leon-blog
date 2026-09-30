import { afterEach, describe, expect, it, vi } from "vitest";
import { clientApi } from "@/lib/client-api";
import { evaluateCacheStatus, mutationNeedsReview } from "@/components/views/admin/editor-state";

/** A complete, contract-conforming AdminPostDTO write-response fixture. */
function fullPostDto(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "post-1",
    title: "标题",
    slug: "slug-1",
    excerpt: "摘要",
    contentMd: "# 正文",
    coverImageUrl: null,
    status: "DRAFT",
    seoTitle: null,
    seoDescription: null,
    seoImageUrl: null,
    categoryId: null,
    tagIds: [],
    publishedAt: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("client API results", () => {
  it("retains conflict metadata without navigating or retrying", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const fetch = vi.fn().mockResolvedValue(Response.json({
      error: { code: "POST_CONCURRENT_MODIFICATION", message: "版本冲突", details: { version: 2 }, requestId: "req-conflict" },
    }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const result = await clientApi.updatePost("post-id", { content: { title: "本地正文" }, version: 1 }, { expectedStatus: "DRAFT" });
    expect(result).toMatchObject({ data: null, error: "版本冲突", status: 409, errorCode: "POST_CONCURRENT_MODIFICATION", details: { version: 2 }, requestId: "req-conflict" });
    expect(assign).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves an expired editing session on the page so input can be recovered", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "AUTH_INVALID", message: "会话已失效" } }, { status: 401 })));
    expect(await clientApi.updatePost("post-id", { version: 1, action: "publish" }, { expectedStatus: "PUBLISHED" })).toMatchObject({ status: 401, errorCode: "AUTH_INVALID" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("retains HTTP status for non-JSON gateway failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502, headers: { "x-request-id": "gateway-1" } })));
    expect(await clientApi.getAdminPosts()).toMatchObject({ status: 502, errorCode: "HTTP_ERROR", requestId: "gateway-1" });
  });

  it("distinguishes network failures and makes no retry of writes", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    expect(await clientApi.createPost({ title: "标题", excerpt: "摘要", contentMd: "正文" })).toMatchObject({ status: 0, errorCode: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the baseline version in every delete request", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await clientApi.deletePost("post-id", 2);
    await clientApi.deleteCategory("category-id", 3);
    await clientApi.deleteTag("tag-id", 4);
    expect(fetch.mock.calls.map((call) => (call[1].headers as Headers).get("If-Match"))).toEqual(['"2"', '"3"', '"4"']);
    expect(fetch.mock.calls.every((call) => call[1].cache === "no-store")).toBe(true);
  });

  it("maps pagination and keeps versions from the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "p", title: "Title", slug: "title", status: "DRAFT", version: 3 }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } })));
    const result = await clientApi.getAdminPosts();
    expect(result.data?.[0]?.version).toBe(3);
    expect(result.meta?.totalPages).toBe(2);
  });

  it("surfaces the X-Public-Cache-Status header of admin writes, including on 204 (FR-03)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { data: fullPostDto({ id: "p", status: "DRAFT", version: 2 }) },
      { status: 200, headers: { "x-public-cache-status": "failed" } },
    )));
    expect(await clientApi.updatePost("p", { version: 1 }, { expectedStatus: "DRAFT" })).toMatchObject({ cacheStatus: "failed" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { "x-public-cache-status": "invalidated" } })));
    expect(await clientApi.deletePost("p", 2)).toMatchObject({ cacheStatus: "invalidated" });
  });

  it("keeps an absent cache header absent so callers must treat it as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { data: fullPostDto({ id: "p", status: "DRAFT", version: 2 }) },
      { status: 200 },
    )));
    const result = await clientApi.updatePost("p", { version: 1 }, { expectedStatus: "DRAFT" });
    expect(result.cacheStatus).toBeUndefined();
    expect(evaluateCacheStatus(result.cacheStatus)).toBe("unknown");
  });

  it("posts an empty JSON object to the standalone revalidate endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(
      { data: { cacheStatus: "invalidated" } },
      { status: 200, headers: { "x-public-cache-status": "invalidated" } },
    ));
    vi.stubGlobal("fetch", fetch);
    const result = await clientApi.revalidatePublicCache();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/admin/cache/revalidate",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(result.data).toEqual({ cacheStatus: "invalidated" });
  });
});

describe("admin post-write response boundary validation (delivery §4.1, Codex rounds 3+4)", () => {
  function stubFetch(data: unknown, status = 200) {
    return vi.fn().mockResolvedValue(Response.json({ data }, { status }));
  }

  // ---- create: 201 + DRAFT + version 0 + complete DTO -------------------
  it("a create 2xx missing id/status/version is INVALID_RESPONSE (unknown), never a created post", async () => {
    vi.stubGlobal("fetch", stubFetch({ version: 2 }, 201));
    const result = await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" });
    expect(result.data).toBeNull();
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it("a create returned over 200 instead of the contract 201 is unknown", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto(), 200));
    const result = await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" });
    expect(result.errorCode).toBe("INVALID_RESPONSE");
  });

  it("a create 201 that is not DRAFT / not version 0 is unknown", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status: "PUBLISHED" }), 201));
    expect((await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" })).errorCode).toBe("INVALID_RESPONSE");
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ version: 1 }), 201));
    expect((await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" })).errorCode).toBe("INVALID_RESPONSE");
  });

  // ---- update: id match, version = request+1, action target status ------
  it("a publish 200 still reporting DRAFT is unknown — the action demonstrably did not take effect", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status: "DRAFT", version: 2 })));
    const result = await clientApi.updatePost("post-1", { version: 1, action: "publish" }, { expectedStatus: "PUBLISHED" });
    expect(result.data).toBeNull();
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it.each([
    ["archive reporting PUBLISHED", "archive", "PUBLISHED"],
    ["restore reporting ARCHIVED", "restore", "ARCHIVED"],
  ])("%s is unknown", (_label, action, wrongStatus) => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status: wrongStatus, version: 2 })));
    return clientApi.updatePost("post-1", { version: 1, action: action as "archive" | "restore" }, { expectedStatus: action === "archive" ? "ARCHIVED" : "DRAFT" }).then((result) => {
      expect(result.errorCode).toBe("INVALID_RESPONSE");
      expect(result.data).toBeNull();
    });
  });

  it("an update whose version did not advance by exactly +1 is unknown", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status: "DRAFT", version: 1 })));
    expect((await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" })).errorCode).toBe("INVALID_RESPONSE");
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status: "DRAFT", version: 3 })));
    expect((await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" })).errorCode).toBe("INVALID_RESPONSE");
  });

  it("an update 2xx whose id is not the written object is rejected (no cross-object adoption)", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ id: "other-post", status: "DRAFT", version: 2 })));
    const result = await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" });
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  // ---- required AdminPostDTO fields --------------------------------------
  it("a 200 carrying only {id,status,version} lacks required DTO fields → unknown", async () => {
    vi.stubGlobal("fetch", stubFetch({ id: "post-1", status: "PUBLISHED", version: 2 }));
    const result = await clientApi.updatePost("post-1", { version: 1, action: "publish" }, { expectedStatus: "PUBLISHED" });
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it.each([
    ["missing contentMd", { contentMd: undefined }],
    ["missing tagIds", { tagIds: undefined }],
    ["missing createdAt", { createdAt: undefined }],
    ["non-nullable coverImageUrl", { coverImageUrl: 5 }],
    ["seoTitle as number", { seoTitle: 7 }],
    ["publishedAt as boolean", { publishedAt: false }],
    ["tagIds containing a non-string", { tagIds: ["ok", 3] }],
    ["empty text is fine, missing text is not", { title: "" }],
  ])("a DTO with %s is rejected (except where noted)", (label, patch) => {
    const allowed = label.includes("is fine");
    const payload: Record<string, unknown> = { ...fullPostDto({ status: "DRAFT", version: 2 }), ...patch };
    // strip undefined so JSON omits the field entirely
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    vi.stubGlobal("fetch", stubFetch(payload));
    return clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" }).then((result) => {
      expect(result.errorCode === "INVALID_RESPONSE").toBe(!allowed);
      if (!allowed) expect(result.data).toBeNull();
    });
  });

  it.each([
    ["fractional version", { version: 1.5 }],
    ["negative version", { version: -1 }],
    ["string version", { version: "2" }],
    ["out-of-contract version", { version: 2147483648 }],
    ["illegal status", { status: "LIVE" }],
  ])("an update 2xx with %s is rejected", (_label, patch) => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto(patch)));
    return clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" }).then((result) => {
      expect(result.errorCode).toBe("INVALID_RESPONSE");
      expect(result.data).toBeNull();
    });
  });

  // ---- happy paths must not regress ---------------------------------------
  it("a contract-conforming create (201, DRAFT, v0, full DTO) passes through untouched", async () => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto(), 201));
    const result = await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "post-1", status: "DRAFT", version: 0 });
  });

  it.each([
    ["publish", "publish", "PUBLISHED", 2],
    ["save", undefined, "DRAFT", 5],
    ["archive", "archive", "ARCHIVED", 6],
    ["restore", "restore", "DRAFT", 7],
  ])("a contract-conforming %s response (version = request+1, target status) passes through", (_label, action, status, version) => {
    vi.stubGlobal("fetch", stubFetch(fullPostDto({ status, version })));
    return clientApi.updatePost("post-1", { version: version - 1, ...(action ? { action: action as "publish" | "archive" | "restore" } : {}) }, { expectedStatus: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" }).then((result) => {
      expect(result.error).toBeNull();
      expect(result.data?.status).toBe(status);
      expect(result.data?.version).toBe(version);
    });
  });

  // ---- delete: only the contract 204 proves success -----------------------
  it("DELETE 200 with a JSON body is unknown — the editor must not treat the post as hard-deleted", async () => {
    vi.stubGlobal("fetch", stubFetch({}, 200));
    const result = await clientApi.deletePost("post-1", 2);
    expect(result.data).toBeNull();
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it("DELETE 204 (empty body) passes through as the definite success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await clientApi.deletePost("post-1", 2);
    expect(result.error).toBeNull();
    expect(result.status).toBe(204);
  });

  it("definite DELETE error classifications still pass through unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { error: { code: "POST_CONCURRENT_MODIFICATION", message: "版本冲突" } },
      { status: 409 },
    )));
    const result = await clientApi.deletePost("post-1", 2);
    expect(result.errorCode).toBe("POST_CONCURRENT_MODIFICATION");
    expect(mutationNeedsReview(result)).toBe(true);
  });
});

describe("mixed envelope and strict status-code validation (delivery §4.1, Codex round 5)", () => {
  function stubEnvelope(body: unknown, status: number) {
    return vi.fn().mockResolvedValue(Response.json(body, { status }));
  }

  it("a PATCH 200 carrying a complete valid DTO AND an error field is unknown — never success, never a 422 rejection", async () => {
    vi.stubGlobal("fetch", stubEnvelope({
      data: fullPostDto({ id: "post-1", status: "PUBLISHED", version: 2 }),
      error: { code: "POST_NOT_READY", message: "发布失败" },
    }, 200));
    const result = await clientApi.updatePost("post-1", { version: 1, action: "publish" }, { expectedStatus: "PUBLISHED" });
    expect(result.data).toBeNull();
    // The embedded error must NOT be promoted to a definite rejection code.
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });

  it("a create 201 with data + error is unknown as well", async () => {
    vi.stubGlobal("fetch", stubEnvelope({
      data: fullPostDto(),
      error: { code: "INTERNAL_ERROR", message: "矛盾响应" },
    }, 201));
    const result = await clientApi.createPost({ title: "t", excerpt: "e", contentMd: "c" });
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(result.data).toBeNull();
  });

  it("an envelope-level error on a 2xx read is also rejected (corrupt success shape)", async () => {
    vi.stubGlobal("fetch", stubEnvelope({ data: fullPostDto(), error: { code: "X", message: "y" } }, 200));
    const result = await clientApi.getAdminPost("post-1");
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(result.data).toBeNull();
  });

  it("PATCH must answer HTTP 200 exactly — a 201 with a complete DTO is unknown", async () => {
    vi.stubGlobal("fetch", stubEnvelope({ data: fullPostDto({ status: "PUBLISHED", version: 2 }) }, 201));
    const result = await clientApi.updatePost("post-1", { version: 1, action: "publish" }, { expectedStatus: "PUBLISHED" });
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(result.data).toBeNull();
  });

  it("a no-action save verified against the editor's known status rejects unexpected drift", async () => {
    vi.stubGlobal("fetch", stubEnvelope({ data: fullPostDto({ status: "ARCHIVED", version: 2 }) }, 200));
    const drifted = await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" });
    expect(drifted.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(drifted)).toBe(true);

    vi.stubGlobal("fetch", stubEnvelope({ data: fullPostDto({ status: "DRAFT", version: 2 }) }, 200));
    const steady = await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" });
    expect(steady.error).toBeNull();
    expect(steady.data?.status).toBe("DRAFT");
  });

  it("the verification parameter is client-only and never serialized into the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(
      { data: fullPostDto({ status: "DRAFT", version: 2 }) },
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await clientApi.updatePost("post-1", { version: 1 }, { expectedStatus: "DRAFT" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toEqual({ version: 1 });
    expect(JSON.stringify(body)).not.toContain("expectedStatus");
  });

  it("a DELETE with a mixed-envelope 200 stays unknown (only bodyless 204 proves the delete)", async () => {
    vi.stubGlobal("fetch", stubEnvelope({ data: {}, error: { code: "X", message: "y" } }, 200));
    const result = await clientApi.deletePost("post-1", 2);
    expect(result.errorCode).toBe("INVALID_RESPONSE");
    expect(mutationNeedsReview(result)).toBe(true);
  });
});
