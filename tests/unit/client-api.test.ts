import { afterEach, describe, expect, it, vi } from "vitest";
import { clientApi } from "@/lib/client-api";

afterEach(() => vi.unstubAllGlobals());

describe("client API results", () => {
  it("retains conflict metadata without navigating or retrying", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const fetch = vi.fn().mockResolvedValue(Response.json({
      error: { code: "POST_CONCURRENT_MODIFICATION", message: "版本冲突", details: { version: 2 }, requestId: "req-conflict" },
    }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const result = await clientApi.updatePost("post-id", { content: { title: "本地正文" }, version: 1 });
    expect(result).toMatchObject({ data: null, error: "版本冲突", status: 409, errorCode: "POST_CONCURRENT_MODIFICATION", details: { version: 2 }, requestId: "req-conflict" });
    expect(assign).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves an expired editing session on the page so input can be recovered", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "AUTH_INVALID", message: "会话已失效" } }, { status: 401 })));
    expect(await clientApi.updatePost("post-id", { version: 1, action: "publish" })).toMatchObject({ status: 401, errorCode: "AUTH_INVALID" });
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
});
