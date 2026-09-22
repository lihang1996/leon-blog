import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { SiteShellProps } from "@/app/site-shell";
import { computePagination } from "@/lib/pagination";
import type { PublicSearchParams } from "@/lib/public-query";

const mocks = vi.hoisted(() => ({
  posts: {
    listPublishedPosts: vi.fn(), searchPublishedPosts: vi.fn(),
    getPublishedPostBySlug: vi.fn(), getPublishedNeighbor: vi.fn(),
    listPostsByCategory: vi.fn(), listPostsByTag: vi.fn(),
  },
  categories: { listPublicCategories: vi.fn(), getPublicCategoryBySlug: vi.fn() },
  tags: { listPublicTags: vi.fn(), getPublicTagBySlug: vi.fn() },
  requireAdmin: vi.fn(), resolveLoginState: vi.fn(),
}));
vi.mock("@/modules/post", () => ({ postQueryService: mocks.posts }));
vi.mock("@/modules/category", () => ({ categoryService: mocks.categories }));
vi.mock("@/modules/tag", () => ({ tagService: mocks.tags }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/login-state", () => ({ resolveLoginState: mocks.resolveLoginState }));
vi.mock("@/lib/env", () => ({ siteName: "Test blog", siteUrl: "https://blog.example" }));
vi.mock("@/app/site-shell", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not-found"); },
}));

import CatchAllPage from "@/app/[[...slug]]/page";

type PageProps = Parameters<typeof CatchAllPage>[0];
async function renderRoute(slug: string[], search: PublicSearchParams = {}) {
  const props = { params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) };
  // Evaluate the server child beneath Suspense; no browser, Next server or DB.
  const content = CatchAllPage(props).props.children as {
    type: (props: PageProps) => Promise<ReactElement<SiteShellProps>>;
    props: PageProps;
  };
  return (await content.type(content.props)).props;
}

function expectNoPublicQueries() {
  for (const mock of [...Object.values(mocks.posts), ...Object.values(mocks.categories), ...Object.values(mocks.tags)]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  mocks.resolveLoginState.mockResolvedValue({ clearInvalidSession: true, callbackUrl: "/admin/posts" });
  mocks.categories.listPublicCategories.mockResolvedValue([]);
  mocks.tags.listPublicTags.mockResolvedValue([]);
  for (const mock of [mocks.posts.listPublishedPosts, mocks.posts.searchPublishedPosts, mocks.posts.listPostsByCategory, mocks.posts.listPostsByTag]) {
    mock.mockResolvedValue({ items: [], pagination: computePagination(1, 6, 0) });
  }
});

describe("route-scoped reads", () => {
  it("returns admin UI immediately after authorization", async () => {
    const result = await renderRoute(["admin", "posts"]);
    expect(result.route).toBe("admin:posts");
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expectNoPublicQueries();
  });

  it("passes login query strings to the auth helper without public reads", async () => {
    const result = await renderRoute(["admin", "login"], { reason: ["expired", "ignored"], callbackUrl: "/admin/posts" });
    expect(mocks.resolveLoginState).toHaveBeenCalledWith({ reason: "expired", callbackUrl: "/admin/posts" });
    expect(result).toEqual({ route: "login", initialData: { loginState: { clearInvalidSession: true, callbackUrl: "/admin/posts" } } });
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expectNoPublicQueries();
  });

  it("does not run a query for blank search", async () => {
    const result = await renderRoute(["search"], { q: "  " });
    expect(result.initialData).toMatchObject({ posts: [], query: { q: "", page: 1 }, pagination: { total: 0 } });
    expectNoPublicQueries();
  });

  it.each(["categories", "tags"])("fetches only the %s directory", async (kind) => {
    const result = await renderRoute([kind]);
    expect(result.route).toBe(kind);
    for (const mock of Object.values(mocks.posts)) expect(mock).not.toHaveBeenCalled();
    if (kind === "categories") {
      expect(mocks.categories.listPublicCategories).toHaveBeenCalledOnce();
      expect(mocks.tags.listPublicTags).not.toHaveBeenCalled();
    } else {
      expect(mocks.tags.listPublicTags).toHaveBeenCalledOnce();
      expect(mocks.categories.listPublicCategories).not.toHaveBeenCalled();
    }
  });

  it("fetches only four home posts and the category directory", async () => {
    await renderRoute([]);
    expect(mocks.posts.listPublishedPosts).toHaveBeenCalledWith({ page: 1, pageSize: 4 });
    expect(mocks.categories.listPublicCategories).toHaveBeenCalledOnce();
    expect(mocks.tags.listPublicTags).not.toHaveBeenCalled();
  });

  it("passes the current detail and neighbor without fetching public lists", async () => {
    const post = { slug: "current", title: "Current", excerpt: "", contentMd: "body", tags: [] };
    const neighbor = { slug: "next", title: "Next", excerpt: "", tags: [] };
    mocks.posts.getPublishedPostBySlug.mockResolvedValue(post);
    mocks.posts.getPublishedNeighbor.mockResolvedValue(neighbor);
    const result = await renderRoute(["posts", "current"]);
    expect(result.initialData?.postDetail).toMatchObject(post);
    expect(result.initialData?.nextPost).toMatchObject(neighbor);
    expect(mocks.posts.listPublishedPosts).not.toHaveBeenCalled();
    expect(mocks.categories.listPublicCategories).not.toHaveBeenCalled();
    expect(mocks.tags.listPublicTags).not.toHaveBeenCalled();
  });
});

describe("URL-driven list props", () => {
  it("fetches posts matching normalized page, filters, keyword and sort", async () => {
    const pagination = computePagination(2, 10, 25);
    mocks.posts.listPublishedPosts.mockResolvedValue({ items: [{ slug: "match", title: "Match", excerpt: "" }], pagination });
    const result = await renderRoute(["posts"], { page: "2", category: "frontend", tag: "react", q: " hooks ", sort: "updated" });
    const query = { page: 2, pageSize: 10, category: "frontend", tag: "react", q: "hooks", sort: "updated" };
    expect(mocks.posts.listPublishedPosts).toHaveBeenCalledWith(query, {
      categorySlug: "frontend", tagSlug: "react", keyword: "hooks", sort: "updated",
    });
    expect(result.initialData).toMatchObject({ query, pagination, posts: [{ slug: "match" }] });
  });

  it.each(["categories", "tags"])("resolves %s detail separately, even when missing from its sidebar", async (kind) => {
    const detail = { slug: "empty", name: "Empty", postCount: 0 };
    const detailMock = kind === "categories" ? mocks.categories.getPublicCategoryBySlug : mocks.tags.getPublicTagBySlug;
    const listMock = kind === "categories" ? mocks.posts.listPostsByCategory : mocks.posts.listPostsByTag;
    detailMock.mockResolvedValue(detail);
    listMock.mockResolvedValue({ items: [], pagination: computePagination(2, 6, 12) });
    const result = await renderRoute([kind, "empty"], { page: "2" });
    expect(listMock).toHaveBeenCalledWith("empty", expect.objectContaining({ page: 2, pageSize: 6 }));
    expect(result.initialData?.[kind === "categories" ? "category" : "tag"]).toEqual(detail);
    expect(result.initialData?.query?.page).toBe(2);
    expect(mocks.posts.listPublishedPosts).not.toHaveBeenCalled();
  });

  it("redirects out-of-range search without dropping its keyword", async () => {
    mocks.posts.searchPublishedPosts.mockResolvedValue({ items: [], pagination: computePagination(20, 6, 7) });
    await expect(renderRoute(["search"], { q: "hooks", page: "20" })).rejects.toThrow("redirect:/search?q=hooks&page=2");
    expect(mocks.posts.searchPublishedPosts).toHaveBeenCalledWith("hooks", expect.objectContaining({ page: 20, pageSize: 6 }));
  });

  it("lets query failures reach the route error boundary", async () => {
    mocks.posts.searchPublishedPosts.mockRejectedValue(new Error("database unavailable"));
    await expect(renderRoute(["search"], { q: "hooks" })).rejects.toThrow("database unavailable");
  });
});
