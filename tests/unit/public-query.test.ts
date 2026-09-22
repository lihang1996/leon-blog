import { describe, expect, it } from "vitest";
import { MAX_PAGE, MAX_PAGE_SIZE, computePagination } from "@/lib/pagination";
import { normalizePublicPage, normalizePublicQuery, publicPageRedirect, publicQueryHref } from "@/lib/public-query";

describe("public query normalization", () => {
  it("normalizes repeated values, filters, keyword limits and sorting", () => {
    expect(normalizePublicQuery({
      page: ["2", "3"], pageSize: "999", category: " frontend ", tag: " react ",
      q: [` ${"x".repeat(60)} `, "ignored"], sort: "updated",
    })).toEqual({ page: 2, pageSize: MAX_PAGE_SIZE, category: "frontend", tag: "react", q: "x".repeat(50), sort: "updated" });
    expect(normalizePublicQuery({ page: "-2", q: "  ", sort: "invalid" }, 6))
      .toEqual({ page: 1, pageSize: 6, category: "", tag: "", q: "", sort: "latest" });
  });

  it("bounds service inputs before entering cached functions", () => {
    expect(normalizePublicPage({ page: 1e30, pageSize: 1e30 })).toEqual({ page: MAX_PAGE, pageSize: MAX_PAGE_SIZE });
    expect(normalizePublicPage({ page: 2.8, pageSize: -2 })).toEqual({ page: 2, pageSize: 1 });
    expect(normalizePublicPage({ page: NaN, pageSize: Infinity })).toEqual({ page: 1, pageSize: 10 });
  });
});

describe("public list URLs", () => {
  it.each(["/posts", "/search", "/categories/frontend", "/tags/react"])("clamps %s while preserving query conditions, without loops", (path) => {
    const params = { page: "999999999", q: "Next.js & React", category: "frontend", tag: "react", sort: "updated", pageSize: "6" };
    const target = publicPageRedirect(path, params, computePagination(MAX_PAGE, 6, 13));
    const url = new URL(target!, "https://blog.example");
    expect(url.pathname).toBe(path);
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...params, page: "3" });
    expect(publicPageRedirect(path, Object.fromEntries(url.searchParams), computePagination(3, 6, 13))).toBeNull();
  });

  it("clamps an empty result to page one and keeps its search term", () => {
    expect(publicPageRedirect("/search", { page: "8", q: "missing" }, computePagination(8, 6, 0))).toBe("/search?q=missing");
    expect(publicPageRedirect("/search", { q: "missing" }, computePagination(1, 6, 0))).toBeNull();
  });

  it.each(["-2", "0", "bad", "01"])("canonicalizes malformed page %s once", (page) => {
    const query = normalizePublicQuery({ page });
    expect(publicPageRedirect("/posts", { page }, computePagination(query.page, 10, 0))).toBe("/posts");
    expect(publicPageRedirect("/posts", {}, computePagination(1, 10, 0))).toBeNull();
  });

  it("updates filters and pagination without mutating the original URL", () => {
    const params = new URLSearchParams("q=C%2B%2B&tag=react&sort=updated&page=2&extra=a&extra=b");
    const target = publicQueryHref("/posts", params, { category: "frontend", page: 1 });
    const query = new URL(target, "https://blog.example").searchParams;
    expect(query.get("q")).toBe("C++");
    expect(query.get("tag")).toBe("react");
    expect(query.get("sort")).toBe("updated");
    expect(query.get("category")).toBe("frontend");
    expect(query.getAll("extra")).toEqual(["a", "b"]);
    expect(query.has("page")).toBe(false);
    expect(params.get("page")).toBe("2");
  });
});
