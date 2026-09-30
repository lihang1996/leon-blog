import { describe, expect, it } from "vitest";
import {
  buildAdminPostsHref,
  buildAdminPostsSearch,
  controlChangeHref,
  pageCorrectionHref,
  parseAdminPostsQuery,
} from "@/components/views/admin/admin-posts-url-state";

describe("parseAdminPostsQuery (FR-08 param contract)", () => {
  it("reads a fully specified non-default query", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams("status=DRAFT&sort=updated&page=2"));
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.sort).toBe("updated");
    expect(parsed.page).toBe(2);
    expect(parsed.needsNormalization).toBe(false);
  });

  it("empty query means the defaults with nothing to normalize", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams(""));
    expect(parsed).toMatchObject({ status: "ALL", sort: "published", page: 1 });
    expect(parsed.needsNormalization).toBe(false);
  });

  it("illegal status/sort fall back to defaults and flag one replace", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams("status=BOGUS&sort=newest"));
    expect(parsed.status).toBe("ALL");
    expect(parsed.sort).toBe("published");
    expect(parsed.needsNormalization).toBe(true);
  });

  it("duplicates take the first value and normalize", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams("status=DRAFT&status=PUBLISHED"));
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.needsNormalization).toBe(true);
  });

  it("negative, zero, fractional, non-numeric, and overflowing pages default to 1", () => {
    for (const page of ["0", "-3", "1.5", "abc", "100001", "999999999999999999999"]) {
      const parsed = parseAdminPostsQuery(new URLSearchParams(`page=${page}`));
      expect(parsed.page, page).toBe(1);
    }
  });

  it("explicit defaults are flagged for omission from the address", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams("status=ALL&sort=published&page=1"));
    expect(parsed.needsNormalization).toBe(true);
  });

  it("non-contract params are dropped by normalization (they never shape the list)", () => {
    const parsed = parseAdminPostsQuery(new URLSearchParams("status=DRAFT&pageSize=999&foo=bar"));
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.needsNormalization).toBe(true);
    expect(buildAdminPostsSearch({ status: parsed.status, sort: parsed.sort, page: parsed.page })).toBe("status=DRAFT");
  });
});

describe("buildAdminPostsSearch / href (default omission)", () => {
  it("omits every default", () => {
    expect(buildAdminPostsSearch({ status: "ALL", sort: "published", page: 1 })).toBe("");
    expect(buildAdminPostsHref({ status: "ALL", sort: "published", page: 1 })).toBe("/admin/posts");
  });

  it("serializes only non-default values in a fixed order", () => {
    expect(buildAdminPostsSearch({ status: "DRAFT", sort: "updated", page: 3 })).toBe("status=DRAFT&sort=updated&page=3");
    expect(buildAdminPostsHref({ status: "ARCHIVED", sort: "published", page: 1 })).toBe("/admin/posts?status=ARCHIVED");
  });
});

describe("controlChangeHref (user actions)", () => {
  it("switching status or sort resets to page 1", () => {
    const current = { status: "ALL" as const, sort: "published" as const, page: 4 };
    expect(controlChangeHref(current, { status: "DRAFT" })).toBe("/admin/posts?status=DRAFT");
    expect(controlChangeHref(current, { sort: "updated" })).toBe("/admin/posts?sort=updated");
    expect(controlChangeHref({ status: "DRAFT", sort: "published", page: 4 }, { status: "PUBLISHED" })).toBe("/admin/posts?status=PUBLISHED");
  });
});

describe("pageCorrectionHref (data-driven fixes)", () => {
  it("clamps into [1, MAX_ADMIN_PAGE]", () => {
    const current = { status: "ALL" as const, sort: "published" as const, page: 7 };
    expect(pageCorrectionHref(current, 0)).toBe("/admin/posts");
    expect(pageCorrectionHref(current, -2)).toBe("/admin/posts");
    expect(pageCorrectionHref(current, 2)).toBe("/admin/posts?page=2");
    expect(pageCorrectionHref(current, 100001)).toBe("/admin/posts?page=100000");
  });

  it("keeps the other conditions while correcting the page", () => {
    expect(pageCorrectionHref({ status: "DRAFT", sort: "updated", page: 9 }, 3)).toBe("/admin/posts?status=DRAFT&sort=updated&page=3");
  });
});
