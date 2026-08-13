import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/require-admin";
import { authError, ErrorCodes } from "@/lib/errors";
import { GET as listPosts, POST as createPost } from "@/app/api/v1/admin/posts/route";
import { GET as getPost, PATCH as patchPost, DELETE as deletePost } from "@/app/api/v1/admin/posts/[id]/route";
import { DELETE as deleteCategory } from "@/app/api/v1/admin/categories/[id]/route";
import { DELETE as deleteTag } from "@/app/api/v1/admin/tags/[id]/route";
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
        body: { action: "publish" },
      }),
      routeContext({ id: draft.id }),
    );
    expect(publish.status).toBe(200);
    const { data: published } = await publish.json();
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
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

    const res = await deletePost(makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN }), routeContext({ id: draft.id }));
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

  it("refuses to hard-delete a published post (422)", async () => {
    mockAdmin();
    const create = await createPost(
      makeRequest(BASE, { method: "POST", origin: ORIGIN, contentType: "application/json", body: { title: "已发布", excerpt: "e", contentMd: "# c" } }),
    );
    const { data: draft } = await create.json();
    await patchPost(
      makeRequest(`${BASE}/${draft.id}`, { method: "PATCH", origin: ORIGIN, contentType: "application/json", body: { action: "publish" } }),
      routeContext({ id: draft.id }),
    );

    const res = await deletePost(makeRequest(`${BASE}/${draft.id}`, { method: "DELETE", origin: ORIGIN }), routeContext({ id: draft.id }));
    expect(res.status).toBe(422);
  });
});

describe("category/tag DELETE (bodyless 415 regression)", () => {
  it("deletes a category via DELETE without Content-Type (204)", async () => {
    mockAdmin();
    const { category } = await categoryService.createCategory({ name: "待删分类", slug: "to-delete" });
    const res = await deleteCategory(
      makeRequest(`http://localhost:3000/api/v1/admin/categories/${category.id}`, { method: "DELETE", origin: ORIGIN }),
      routeContext({ id: category.id }),
    );
    expect(res.status).toBe(204);
    expect(await categoryService.listAdminCategories()).toHaveLength(0);
  });

  it("deletes a tag via DELETE without Content-Type (204)", async () => {
    mockAdmin();
    const { tag } = await tagService.createTag({ name: "待删标签", slug: "to-delete" });
    const res = await deleteTag(
      makeRequest(`http://localhost:3000/api/v1/admin/tags/${tag.id}`, { method: "DELETE", origin: ORIGIN }),
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
    await postCommandService.updatePost({ postId: created.post.id, actorId: author.id, input: { action: "publish" } });

    await deleteTag(makeRequest(`http://localhost:3000/api/v1/admin/tags/${tag.id}`, { method: "DELETE", origin: ORIGIN }), routeContext({ id: tag.id }));

    const detail = await postQueryService.getPublishedPostBySlug("tagged");
    expect(detail).not.toBeNull();
    expect(detail!.tags).toHaveLength(0);
  });
});
