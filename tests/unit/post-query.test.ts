import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PAGE, MAX_PAGE_SIZE } from "@/lib/pagination";

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(), cacheTag: vi.fn(), findPublishedPage: vi.fn(),
  searchPublished: vi.fn(), findPublishedByCategorySlug: vi.fn(),
  findPublishedByTagSlug: vi.fn(), findLatestPublished: vi.fn(),
}));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag }));
vi.mock("@/modules/post/post.repository", () => ({
  postRepository: mocks,
  tagIdsOf: vi.fn(),
}));

import { postQueryService } from "@/modules/post/post-query.service";

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [mocks.findPublishedPage, mocks.searchPublished, mocks.findPublishedByCategorySlug, mocks.findPublishedByTagSlug]) {
    method.mockResolvedValue({ items: [], total: 0 });
  }
  mocks.findLatestPublished.mockResolvedValue([]);
});

describe("public read cache boundary", () => {
  it("keeps keyword-filtered lists outside cache, preserving taxonomy and sort", async () => {
    await postQueryService.listPublishedPosts({ page: 2, pageSize: 6 }, {
      keyword: "  React  ", categorySlug: " frontend ", tagSlug: " hooks ", sort: "updated",
    });
    expect(mocks.findPublishedPage).toHaveBeenCalledWith({ page: 2, pageSize: 6 }, {
      keyword: "React", categorySlug: "frontend", tagSlug: "hooks", sort: "updated",
    });
    expect(mocks.cacheLife).not.toHaveBeenCalled();
    expect(mocks.cacheTag).not.toHaveBeenCalled();
  });

  it("retains caching for blank keywords without passing any keyword property", async () => {
    await postQueryService.listPublishedPosts({ page: MAX_PAGE + 1, pageSize: 100 }, { keyword: "  " });
    expect(mocks.findPublishedPage).toHaveBeenCalledWith({ page: MAX_PAGE, pageSize: MAX_PAGE_SIZE }, {
      categorySlug: undefined, tagSlug: undefined, sort: "latest",
    });
    expect(mocks.cacheLife).toHaveBeenCalledWith("blog");
    expect(mocks.cacheTag).toHaveBeenCalled();
    expect(mocks.findPublishedPage.mock.calls[0]![1]).not.toHaveProperty("keyword");
  });

  it("normalizes category, tag and latest-page bounds before cached reads", async () => {
    await postQueryService.listPostsByCategory("frontend", { page: -1, pageSize: 999 });
    await postQueryService.listPostsByTag("react", { page: 1e30, pageSize: 6.5 });
    await postQueryService.listLatestPublishedPosts(1e30);
    expect(mocks.findPublishedByCategorySlug).toHaveBeenCalledWith("frontend", { page: 1, pageSize: 50 });
    expect(mocks.findPublishedByTagSlug).toHaveBeenCalledWith("react", { page: MAX_PAGE, pageSize: 6 });
    expect(mocks.findLatestPublished).toHaveBeenCalledWith(50);
    expect(mocks.cacheLife).toHaveBeenCalledTimes(3);
  });

  it("does not query or cache blank search, and bounds nonblank search", async () => {
    expect(await postQueryService.searchPublishedPosts("  ", { page: 1, pageSize: 6 }))
      .toEqual({ items: [], pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1 } });
    expect(mocks.searchPublished).not.toHaveBeenCalled();
    await postQueryService.searchPublishedPosts(` ${"x".repeat(60)} `, { page: -1, pageSize: 999 });
    expect(mocks.searchPublished).toHaveBeenCalledWith("x".repeat(50), { page: 1, pageSize: 50 });
    expect(mocks.cacheLife).not.toHaveBeenCalled();
  });

  it("propagates infrastructure errors rather than returning an empty list", async () => {
    const error = new Error("database unavailable");
    mocks.findPublishedPage.mockRejectedValue(error);
    await expect(postQueryService.listPublishedPosts({ page: 1, pageSize: 10 })).rejects.toBe(error);
    await expect(postQueryService.listPublishedPosts({ page: 1, pageSize: 10 }, { keyword: "React" })).rejects.toBe(error);
  });
});
