import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/require-admin";
import { authError, ErrorCodes } from "@/lib/errors";
import { POST as createPostRoute } from "@/app/api/v1/admin/posts/route";
import { PATCH as patchPost, DELETE as deletePost } from "@/app/api/v1/admin/posts/[id]/route";
import { POST as revalidateCache } from "@/app/api/v1/admin/cache/revalidate/route";
import { prisma } from "@/lib/db/prisma";
import { CACHE_TAGS } from "@/lib/cache/cache-invalidation";
import { resetDatabase, createAdminUser, makeRequest, routeContext, TEST_ADMIN, createTag } from "./helpers";

/**
 * FR-03 / delivery §4.2 — 提交结果与公开缓存刷新结果分离：
 * - 管理写响应携带 `X-Public-Cache-Status`（invalidated | failed | not-required）；
 * - 单个失效目标失败不阻止其余目标，已提交的业务结果仍按成功返回（标 failed）；
 * - `POST /api/v1/admin/cache/revalidate` 只刷新固定公共缓存，不读写业务数据；
 * - 独立刷新不增加任何业务版本（AC-03-04 服务端侧）。
 *
 * `next/cache` 被 mock 为可注入失败的实现，以在真 PostgreSQL 环境复现
 * “失效执行器抛错”路径（AC-03-03）。
 */
const cacheSpy = vi.hoisted(() => ({
  failPaths: new Set<string>(),
  failTags: new Set<string>(),
  pathCalls: [] as string[],
  tagCalls: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    cacheSpy.pathCalls.push(path);
    if (cacheSpy.failPaths.has(path)) throw new Error(`mock revalidatePath failure: ${path}`);
  },
  revalidateTag: (tag: string) => {
    cacheSpy.tagCalls.push(tag);
    if (cacheSpy.failTags.has(tag)) throw new Error(`mock revalidateTag failure: ${tag}`);
  },
  cacheLife: () => undefined,
  cacheTag: () => undefined,
}));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
const mockedRequireAdmin = vi.mocked(requireAdmin);

const ORIGIN = "http://localhost:3000";
const BASE = "http://localhost:3000/api/v1/admin";

let adminUserId: string;

beforeEach(async () => {
  await resetDatabase();
  adminUserId = (await createAdminUser()).id;
  vi.clearAllMocks();
  cacheSpy.failPaths.clear();
  cacheSpy.failTags.clear();
  cacheSpy.pathCalls.length = 0;
  cacheSpy.tagCalls.length = 0;
});

function mockAdmin() {
  mockedRequireAdmin.mockResolvedValue({ id: adminUserId, email: TEST_ADMIN.email, displayName: "Test", sessionVersion: 1 });
}
function mockUnauthenticated() {
  mockedRequireAdmin.mockRejectedValue(authError(ErrorCodes.AUTH_REQUIRED, "请先登录"));
}

async function createDraft(title = "缓存契约文章", slug = "cache-contract") {
  const res = await createPostRoute(
    makeRequest(`${BASE}/posts`, {
      method: "POST",
      origin: ORIGIN,
      contentType: "application/json",
      body: { title, excerpt: "摘要", contentMd: "# 正文", slug },
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data as { id: string; version: number; slug: string; status: string };
}

describe("X-Public-Cache-Status on admin post writes", () => {
  it("draft creation is public-invisible: 201 + not-required (§4.2.1)", async () => {
    mockAdmin();
    const res = await createPostRoute(
      makeRequest(`${BASE}/posts`, {
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: { title: "草稿", excerpt: "摘要", contentMd: "# 正文" },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("x-public-cache-status")).toBe("not-required");
  });

  it("publish reports invalidated when every target succeeds", async () => {
    mockAdmin();
    const draft = await createDraft();
    const res = await patchPost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-public-cache-status")).toBe("invalidated");
    expect(cacheSpy.pathCalls).toContain("/sitemap.xml");
    expect(cacheSpy.pathCalls).toContain(`/posts/${draft.slug}`);
  });

  it("one failing target skips nothing, and the committed write still succeeds with failed (AC-03-03)", async () => {
    mockAdmin();
    const draft = await createDraft("失效失败", "partial-fail");
    cacheSpy.failTags.add(CACHE_TAGS.post("partial-fail"));

    const res = await patchPost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );

    // The business result is intact and the header separates the outcomes.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-public-cache-status")).toBe("failed");
    const body = await res.json();
    expect(body.data.status).toBe("PUBLISHED");
    expect(body.data.version).toBe(draft.version + 1);
    // The failing target did not stop the remaining ones.
    expect(cacheSpy.tagCalls).toContain(CACHE_TAGS.posts);
    expect(cacheSpy.pathCalls).toContain("/posts/partial-fail");
    expect(cacheSpy.pathCalls).toContain("/");
  });

  it("DELETE of an ever-published archived post keeps the 204 + header contract (FR-03.8 / AC-03-07)", async () => {
    mockAdmin();
    const draft = await createDraft("发布后删除", "gone-after-publish");
    const publish = await patchPost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );
    expect(publish.headers.get("x-public-cache-status")).toBe("invalidated");
    const published = await publish.json();

    const archive = await patchPost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "archive", version: published.data.version },
      }),
      routeContext({ id: draft.id }),
    );
    const archived = await archive.json();

    const del = await deletePost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "DELETE",
        origin: ORIGIN,
        ifMatch: `"${archived.data.version}"`,
      }),
      routeContext({ id: draft.id }),
    );
    expect(del.status).toBe(204);
    expect(del.headers.get("x-public-cache-status")).toBe("invalidated");
    // The old public slug — not just the current DB state — was invalidated.
    expect(cacheSpy.pathCalls).toContain("/posts/gone-after-publish");
    expect(cacheSpy.pathCalls).toContain("/sitemap.xml");
    expect(await prisma.post.findUnique({ where: { id: draft.id } })).toBeNull();
  });

  it("DELETE with a failing refresh stays 204 + failed (the delete itself is committed)", async () => {
    mockAdmin();
    const draft = await createDraft("删除刷新失败", "delete-refresh-fail");
    cacheSpy.failTags.add(CACHE_TAGS.posts);

    const del = await deletePost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "DELETE",
        origin: ORIGIN,
        ifMatch: `"${draft.version}"`,
      }),
      routeContext({ id: draft.id }),
    );
    expect(del.status).toBe(204);
    expect(del.headers.get("x-public-cache-status")).toBe("failed");
    expect(await prisma.post.findUnique({ where: { id: draft.id } })).toBeNull();
  });
});

describe("POST /api/v1/admin/cache/revalidate (standalone refresh)", () => {
  function revalidateRequest(init: Partial<{ origin: string | null; contentType: string | null; body: unknown }> = {}) {
    return makeRequest(`${BASE}/cache/revalidate`, {
      method: "POST",
      origin: init.origin === undefined ? ORIGIN : init.origin,
      contentType: init.contentType === undefined ? "application/json" : init.contentType,
      body: init.body === undefined ? {} : init.body,
    });
  }

  it("requires an admin session (401)", async () => {
    mockUnauthenticated();
    const res = await revalidateCache(revalidateRequest());
    expect(res.status).toBe(401);
  });

  it("rejects a forged Origin (403) and a non-JSON Content-Type (415)", async () => {
    mockAdmin();
    expect((await revalidateCache(revalidateRequest({ origin: "https://evil.example.com" }))).status).toBe(403);
    expect((await revalidateCache(revalidateRequest({ contentType: "text/plain" }))).status).toBe(415);
  });

  it("accepts ONLY the empty object body — caller-supplied paths are refused (§4.2.3)", async () => {
    mockAdmin();
    const res = await revalidateCache(revalidateRequest({ body: { path: "/admin" } }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("invalidates the fixed public set and returns 200 { cacheStatus: invalidated }", async () => {
    mockAdmin();
    const res = await revalidateCache(revalidateRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-public-cache-status")).toBe("invalidated");
    expect(await res.json()).toEqual({ data: { cacheStatus: "invalidated" } });

    expect(cacheSpy.pathCalls).toEqual(["/", "/posts", "/categories", "/tags", "/sitemap.xml"]);
    expect([...cacheSpy.tagCalls].sort()).toEqual(["categories", "posts", "tags"]);
    // No per-entity tag can be requested through this endpoint.
    expect(cacheSpy.tagCalls.every((tag) => !tag.includes(":"))).toBe(true);
  });

  it("returns 503 CACHE_REVALIDATION_FAILED with a request id when any target fails", async () => {
    mockAdmin();
    cacheSpy.failPaths.add("/sitemap.xml");

    const res = await revalidateCache(revalidateRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.CACHE_REVALIDATION_FAILED);
    expect(typeof body.error.requestId).toBe("string");
    // The remaining targets still ran.
    expect(cacheSpy.pathCalls).toContain("/");
    expect(cacheSpy.tagCalls).toContain("posts");
  });

  it("never rewrites business data: repeated refreshes leave every row untouched (AC-03-04)", async () => {
    mockAdmin();
    const tag = await createTag("刷新标签", "refresh-tag");
    const draft = await createDraft("刷新不改业务", "refresh-no-write");
    const publish = await patchPost(
      makeRequest(`${BASE}/posts/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );
    const published = (await publish.json()).data;
    const postBefore = await prisma.post.findUniqueOrThrow({ where: { id: draft.id } });
    const tagBefore = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } });

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await revalidateCache(revalidateRequest());
      expect(res.status).toBe(200);
    }

    const postAfter = await prisma.post.findUniqueOrThrow({ where: { id: draft.id } });
    const tagAfter = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } });
    expect(postAfter).toEqual(postBefore);
    expect(tagAfter).toEqual(tagBefore);
    expect(postAfter.version).toBe(published.version);
    expect(postAfter.updatedAt.getTime()).toBe(postBefore.updatedAt.getTime());
  });
});
