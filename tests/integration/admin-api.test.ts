import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/require-admin";
import { authError, ErrorCodes } from "@/lib/errors";
import { GET as listPosts, POST as createPost } from "@/app/api/v1/admin/posts/route";
import { GET as getPost, PATCH as patchPost, DELETE as deletePost } from "@/app/api/v1/admin/posts/[id]/route";
import { GET as listCategories, POST as createCategoryApi } from "@/app/api/v1/admin/categories/route";
import { PATCH as patchCategory, DELETE as deleteCategory } from "@/app/api/v1/admin/categories/[id]/route";
import { PATCH as patchTag, DELETE as deleteTag } from "@/app/api/v1/admin/tags/[id]/route";
import { GET as listTags } from "@/app/api/v1/admin/tags/route";
import { MAX_ADMIN_JSON_BODY_BYTES } from "@/lib/api/request-body";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { postQueryService } from "@/modules/post";
import { resetDatabase, createAdminUser, makeRequest, routeContext, TEST_ADMIN } from "./helpers";

/**
 * PRD §7.5 — 文章创建、编辑和发布 API；未登录用户不能访问管理接口；写接口
 * 校验同源 Origin 与 Content-Type。DELETE 回归：无 body 的 DELETE 不再要求
 * Content-Type（修复 415），仅校验同源 Origin。
 */
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
const mockedRequireAdmin = vi.mocked(requireAdmin);

const ORIGIN = "http://localhost:3000";
const BASE = "http://localhost:3000/api/v1/admin/posts";

let adminUserId: string;

beforeEach(async () => {
  await resetDatabase();
  adminUserId = (await createAdminUser()).id;
  vi.clearAllMocks();
});

function mockAdmin() {
  // The id must reference a real row — createDraft's author_id has an FK.
  mockedRequireAdmin.mockResolvedValue({ id: adminUserId, email: TEST_ADMIN.email, displayName: "Test", sessionVersion: 1 });
}
function mockUnauthenticated() {
  mockedRequireAdmin.mockRejectedValue(authError(ErrorCodes.AUTH_REQUIRED, "请先登录"));
}

describe("admin post API", () => {
  it("returns 401 for an unauthenticated list request", async () => {
    mockUnauthenticated();
    const res = await listPosts(makeRequest(`${BASE}?status=ALL`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.AUTH_REQUIRED);
  });

  it("creates a draft and publishes it (201 → 200)", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, {
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: { title: "API 文章", excerpt: "摘要", contentMd: "# 正文" },
      }),
    );
    expect(create.status).toBe(201);
    const { data: draft } = await create.json();
    expect(draft.status).toBe("DRAFT");

    const publish = await patchPost(
      makeRequest(`${BASE}/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );
    expect(publish.status).toBe(200);
    const { data: published } = await publish.json();
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
    expect(typeof published.version).toBe("number");
  });

  it("rejects a request with a forged Origin (403)", async () => {
    mockAdmin();
    const res = await createPost(
      makeRequest(BASE, {
        method: "POST",
        origin: "https://evil.example.com",
        contentType: "application/json",
        body: { title: "x", excerpt: "x", contentMd: "x" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing/incorrect Content-Type on JSON writes (415)", async () => {
    mockAdmin();
    const res = await createPost(
      makeRequest(BASE, {
        method: "POST",
        origin: ORIGIN,
        contentType: "text/plain",
        body: { title: "x", excerpt: "x", contentMd: "x" },
      }),
    );
    expect(res.status).toBe(415);
  });

  it("maps a malformed JSON body to 400 instead of 500 (FIND-204)", async () => {
    mockAdmin();
    // Send the raw malformed body directly (makeRequest would JSON-stringify it).
    const res = await createPost(
      new Request(BASE, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: "{ this is not valid json",
      }) as unknown as Parameters<typeof createPost>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("DELETE a draft succeeds without a Content-Type (no body → no 415)", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, { method: "POST", origin: ORIGIN, contentType: "application/json", body: { title: "待删", excerpt: "e", contentMd: "# c" } }),
    );
    const { data: draft } = await create.json();

    const listed = await listPosts(makeRequest(`${BASE}?status=DRAFT`));
    const { data: [baseline] } = await listed.json();
    expect(baseline.version).toBe(draft.version);
    const res = await deletePost(makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${baseline.version}"` }), routeContext({ id: draft.id }));
    expect(res.status).toBe(204);

    // The draft is gone — the 404 now carries the standard error envelope
    // (POST_NOT_FOUND) instead of a bare null body (FIND-208).
    const detail = await getPost(makeRequest(`${BASE}/${draft.id}`), routeContext({ id: draft.id }));
    expect(detail.status).toBe(404);
    const body = await detail.json();
    expect(body.error.code).toBe(ErrorCodes.POST_NOT_FOUND);
    expect(body.error.requestId).toBeTruthy();
  });

  it("rejects a bodyless DELETE with a forged Origin (403)", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, { method: "POST", origin: ORIGIN, contentType: "application/json", body: { title: "待删", excerpt: "e", contentMd: "# c" } }),
    );
    const { data: draft } = await create.json();

    const res = await deletePost(makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: "https://evil.example.com" }), routeContext({ id: draft.id }));
    expect(res.status).toBe(403);
  });

  it("rejects a stale list baseline on PATCH and DELETE, then accepts a refreshed delete", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, { method: "POST", origin: ORIGIN, contentType: "application/json", body: { title: "草稿", excerpt: "e", contentMd: "# c" } }),
    );
    const { data: draft } = await create.json();
    const list = await listPosts(makeRequest(`${BASE}?status=DRAFT`));
    const { data: [baseline] } = await list.json();
    expect(baseline.version).toBe(draft.version);
    const saved = await patchPost(
      makeRequest(`${BASE}/${draft.id}`, {
        method: "PATCH", origin: ORIGIN, contentType: "application/json",
        body: { content: { title: "已保存" }, version: baseline.version },
      }),
      routeContext({ id: draft.id }),
    );
    expect(saved.status).toBe(200);
    const { data: updated } = await saved.json();
    expect(updated.version).toBe(baseline.version + 1);

    const stalePatch = await patchPost(
      makeRequest(`${BASE}/${draft.id}`, {
        method: "PATCH", origin: ORIGIN, contentType: "application/json",
        body: { content: { title: "过期" }, version: baseline.version },
      }),
      routeContext({ id: draft.id }),
    );
    expect(stalePatch.status).toBe(409);
    expect((await stalePatch.json()).error.code).toBe(ErrorCodes.POST_CONCURRENT_MODIFICATION);
    const staleDelete = await deletePost(
      makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${baseline.version}"` }),
      routeContext({ id: draft.id }),
    );
    expect(staleDelete.status).toBe(409);
    expect((await staleDelete.json()).error.code).toBe(ErrorCodes.POST_CONCURRENT_MODIFICATION);

    const refreshed = await listPosts(makeRequest(`${BASE}?status=DRAFT`));
    const { data: [current] } = await refreshed.json();
    expect(current).toMatchObject({ title: "已保存", version: updated.version });
    const removed = await deletePost(
      makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${current.version}"` }),
      routeContext({ id: draft.id }),
    );
    expect(removed.status).toBe(204);
  });

  it("refuses to hard-delete a published post (422)", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, { method: "POST", origin: ORIGIN, contentType: "application/json", body: { title: "已发布", excerpt: "e", contentMd: "# c" } }),
    );
    const { data: draft } = await create.json();
    const publish = await patchPost(
      makeRequest(`${BASE}/${draft.id}`, {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { action: "publish", version: draft.version },
      }),
      routeContext({ id: draft.id }),
    );
    const { data: published } = await publish.json();

    const res = await deletePost(makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${published.version}"` }), routeContext({ id: draft.id }));
    expect(res.status).toBe(422);
  });
});

describe("category/tag DELETE (bodyless 415 regression)", () => {
  it("deletes a category via DELETE without Content-Type (204)", async () => {
    mockAdmin();
    const { category } = await categoryService.createCategory({ name: "待删分类", slug: "to-delete", sortOrder: 0 });
    const res = await deleteCategory(
      makeRequest(`http://localhost:3000/api/v1/admin/categories/${category.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${category.version}"` }),
      routeContext({ id: category.id }),
    );
    expect(res.status).toBe(204);
    expect(await categoryService.listAdminCategories()).toHaveLength(0);
  });

  it("deletes a tag via DELETE without Content-Type (204)", async () => {
    mockAdmin();
    const { tag } = await tagService.createTag({ name: "待删标签", slug: "to-delete" });
    const res = await deleteTag(
      makeRequest(`http://localhost:3000/api/v1/admin/tags/${tag.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${tag.version}"` }),
      routeContext({ id: tag.id }),
    );
    expect(res.status).toBe(204);
    expect(await tagService.listAdminTags()).toHaveLength(0);
  });

  it("deleting a tag keeps the published post and its public visibility", async () => {
    mockAdmin();
    const { tag } = await tagService.createTag({ name: "React", slug: "react" });
    const author = await createAdminUser({ email: "author@test.dev" });
    const { postCommandService } = await import("@/modules/post");

    const created = await postCommandService.createDraft({
      actorId: author.id,
      input: { title: "带标签文章", slug: "tagged", excerpt: "摘要", contentMd: "# 正文", tagIds: [tag.id] },
    });
    await postCommandService.updatePost({
      postId: created.post.id,
      actorId: author.id,
      input: { action: "publish", version: created.post.version },
    });

    // FR-04/§4.3: linking the post bumped the tag's membership epoch, so the
    // stale creation-time version must now conflict (AC-05-01 semantics).
    // Re-read the fresh version — the refreshed confirmation succeeds (AC-05-03).
    const stale = await deleteTag(
      makeRequest(`http://localhost:3000/api/v1/admin/tags/${tag.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${tag.version}"` }),
      routeContext({ id: tag.id }),
    );
    expect(stale.status).toBe(409);
    const refreshed = (await tagService.listAdminTags()).find((item) => item.id === tag.id)!;
    await deleteTag(
      makeRequest(`http://localhost:3000/api/v1/admin/tags/${tag.id}`, { method: "DELETE", origin: ORIGIN, ifMatch: `"${refreshed.version}"` }),
      routeContext({ id: tag.id }),
    );

    const detail = await postQueryService.getPublishedPostBySlug("tagged");
    expect(detail).not.toBeNull();
    expect(detail!.tags).toHaveLength(0);
  });
});

describe("versioned admin writes", () => {
  it.each([
    ["posts", deletePost],
    ["categories", deleteCategory],
    ["tags", deleteTag],
  ] as const)("requires a valid If-Match on %s DELETE", async (resource, remove) => {
    mockAdmin();
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    for (const [ifMatch, status] of [[null, 428], ["", 422], ["0", 422], ['W/"0"', 422], ['"-1"', 422], ['"0", "1"', 422]] as const) {
      const response = await remove(
        makeRequest(`${ORIGIN}/api/v1/admin/${resource}/${id}`, { method: "DELETE", origin: ORIGIN, ifMatch }),
        routeContext({ id }),
      );
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(body.error.requestId).toBeTruthy();
    }
  });

  it.each([
    ["categories", patchCategory, deleteCategory, listCategories, ErrorCodes.CATEGORY_CONCURRENT_MODIFICATION],
    ["tags", patchTag, deleteTag, listTags, ErrorCodes.TAG_CONCURRENT_MODIFICATION],
  ] as const)("uses the client baseline for %s PATCH and DELETE", async (resource, patch, remove, list, conflictCode) => {
    mockAdmin();
    const entity = resource === "categories"
      ? (await categoryService.createCategory({ name: "初始", slug: "baseline", sortOrder: 0 })).category
      : (await tagService.createTag({ name: "初始", slug: "baseline" })).tag;
    expect(entity.version).toBe(0);
    const collectionUrl = `${ORIGIN}/api/v1/admin/${resource}`;
    const url = `${collectionUrl}/${entity.id}`;
    const listed = await list(makeRequest(collectionUrl));
    const { data: [baseline] } = await listed.json();
    expect(baseline.version).toBe(entity.version);

    for (const version of [undefined, null, -1, 0.5, "0"]) {
      const invalid = await patch(
        makeRequest(url, { method: "PATCH", origin: ORIGIN, contentType: "application/json", body: { name: "非法", version } }),
        routeContext({ id: entity.id }),
      );
      expect(invalid.status).toBe(422);
      expect((await invalid.json()).error.code).toBe(ErrorCodes.VALIDATION_FAILED);
    }

    const saved = await patch(
      makeRequest(url, { method: "PATCH", origin: ORIGIN, contentType: "application/json", body: { name: "已保存", version: baseline.version } }),
      routeContext({ id: entity.id }),
    );
    expect(saved.status).toBe(200);
    const { data: updated } = await saved.json();
    expect(updated).toMatchObject({ name: "已保存", version: baseline.version + 1 });
    const stalePatch = await patch(
      makeRequest(url, { method: "PATCH", origin: ORIGIN, contentType: "application/json", body: { name: "过期", version: baseline.version } }),
      routeContext({ id: entity.id }),
    );
    expect(stalePatch.status).toBe(409);
    expect((await stalePatch.json()).error.code).toBe(conflictCode);
    const staleDelete = await remove(
      makeRequest(url, { method: "DELETE", origin: ORIGIN, ifMatch: `"${baseline.version}"` }),
      routeContext({ id: entity.id }),
    );
    expect(staleDelete.status).toBe(409);
    expect((await staleDelete.json()).error.code).toBe(conflictCode);

    const refreshed = await list(makeRequest(collectionUrl));
    const { data: [current] } = await refreshed.json();
    expect(current).toMatchObject({ name: "已保存", version: updated.version });
    const removed = await remove(
      makeRequest(url, { method: "DELETE", origin: ORIGIN, ifMatch: `"${current.version}"` }),
      routeContext({ id: entity.id }),
    );
    expect(removed.status).toBe(204);
  });
});

describe("admin UUID pre-check and JSON body cap", () => {
  const missingId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("returns 422 VALIDATION_FAILED for an illegal post id and never 500", async () => {
    mockAdmin();
    for (const method of [
      () => getPost(makeRequest(`${BASE}/not-a-uuid`), routeContext({ id: "not-a-uuid" })),
      () =>
        patchPost(
          makeRequest(`${BASE}/not-a-uuid`, {
            method: "PATCH",
            origin: ORIGIN,
            contentType: "application/json",
            body: { content: { title: "x", excerpt: "x", contentMd: "x" }, version: 0 },
          }),
          routeContext({ id: "not-a-uuid" }),
        ),
      () => deletePost(makeRequest(`${BASE}/not-a-uuid`, { method: "DELETE", origin: ORIGIN }), routeContext({ id: "not-a-uuid" })),
    ]) {
      const res = await method();
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
    }
  });

  it("returns 404 for a well-formed UUID that does not exist", async () => {
    mockAdmin();
    const res = await getPost(makeRequest(`${BASE}/${missingId}`), routeContext({ id: missingId }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe(ErrorCodes.POST_NOT_FOUND);
  });

  it("returns 422 for illegal category and tag ids on write routes", async () => {
    mockAdmin();
    const categoryRes = await patchCategory(
      makeRequest("http://localhost:3000/api/v1/admin/categories/bad", {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { name: "x" },
      }),
      routeContext({ id: "bad" }),
    );
    expect(categoryRes.status).toBe(422);

    const tagRes = await patchTag(
      makeRequest("http://localhost:3000/api/v1/admin/tags/bad", {
        method: "PATCH",
        origin: ORIGIN,
        contentType: "application/json",
        body: { name: "x" },
      }),
      routeContext({ id: "bad" }),
    );
    expect(tagRes.status).toBe(422);
  });

  it("creates a category with sortOrder 7 and lists it as 7", async () => {
    mockAdmin();
    const created = await createCategoryApi(
      makeRequest("http://localhost:3000/api/v1/admin/categories", {
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: { name: "排序分类", slug: "sorted", sortOrder: 7 },
      }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).data.sortOrder).toBe(7);

    const omitted = await createCategoryApi(
      makeRequest("http://localhost:3000/api/v1/admin/categories", {
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: { name: "无排序", slug: "no-sort" },
      }),
    );
    expect(omitted.status).toBe(422);

    const list = await listCategories(makeRequest("http://localhost:3000/api/v1/admin/categories"));
    const items = (await list.json()).data as Array<{ slug: string; sortOrder: number }>;
    expect(items.find((item) => item.slug === "sorted")?.sortOrder).toBe(7);
  });

  it("rejects an oversized JSON body with 413 PAYLOAD_TOO_LARGE", async () => {
    mockAdmin();
    const oversized = JSON.stringify({ title: "x", excerpt: "x", contentMd: "a".repeat(MAX_ADMIN_JSON_BODY_BYTES) });
    const res = await createPost(
      new Request(BASE, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: oversized,
      }) as unknown as Parameters<typeof createPost>[0],
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe(ErrorCodes.PAYLOAD_TOO_LARGE);
  });

  it("still creates a legal max-length article (200 KiB contentMd)", async () => {
    mockAdmin();
    const res = await createPost(
      makeRequest(BASE, {
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: { title: "长文", excerpt: "摘要", contentMd: "a".repeat(200 * 1024) },
      }),
    );
    expect(res.status).toBe(201);
  });
});
