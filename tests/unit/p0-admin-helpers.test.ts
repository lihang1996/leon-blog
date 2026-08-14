import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCategorySchema } from "@/modules/category/category.schemas";
import { previewBannerLabel } from "@/components/admin/preview-banner";
import { isPageOutOfRange } from "@/lib/pagination";
import { adminPostsHref } from "@/components/admin/admin-posts-href";

describe("createCategorySchema sortOrder", () => {
  it("requires sortOrder and keeps a submitted 7", () => {
    const parsed = createCategorySchema.parse({ name: "前端", slug: "frontend", sortOrder: 7 });
    expect(parsed.sortOrder).toBe(7);
  });

  it("rejects an omitted sortOrder instead of defaulting to 0", () => {
    const result = createCategorySchema.safeParse({ name: "前端", slug: "frontend" });
    expect(result.success).toBe(false);
  });

  it("rejects sortOrder outside 0–1000", () => {
    expect(createCategorySchema.safeParse({ name: "前端", slug: "frontend", sortOrder: -1 }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "前端", slug: "frontend", sortOrder: 1001 }).success).toBe(false);
  });
});

describe("previewBannerLabel", () => {
  it("maps each status and never hard-codes draft for published/archived", () => {
    expect(previewBannerLabel("DRAFT")).toBe("草稿预览 · 仅管理员可见");
    expect(previewBannerLabel("PUBLISHED")).toBe("已发布预览 · 仅管理员可见");
    expect(previewBannerLabel("ARCHIVED")).toBe("已归档预览 · 仅管理员可见");
    expect(previewBannerLabel("PUBLISHED")).not.toContain("草稿预览");
    expect(previewBannerLabel("ARCHIVED")).not.toContain("草稿预览");
  });
});

describe("admin posts out-of-range href", () => {
  it("keeps status when jumping to the last page", () => {
    expect(isPageOutOfRange(999, 3)).toBe(true);
    expect(adminPostsHref("ALL", 3)).toBe("/admin/posts?page=3");
    expect(adminPostsHref("PUBLISHED", 2)).toBe("/admin/posts?status=PUBLISHED&page=2");
  });

  it("does not treat an empty collection page 1 as out of range", () => {
    expect(isPageOutOfRange(1, 1)).toBe(false);
    expect(adminPostsHref("ALL", 1)).toBe("/admin/posts");
  });
});

describe("homepage layout and site icons", () => {
  it("uses a desktop two-column band after Hero and categories", () => {
    const src = readFileSync(new URL("../../src/app/(site)/page.tsx", import.meta.url), "utf8");
    expect(src).toContain("lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(src).toContain('path: "/"');
    expect(src).toContain("buildMetadata");
  });

  it("ships favicon, icon, apple-icon, and the hero ornament", () => {
    const root = new URL("../../", import.meta.url);
    expect(existsSync(new URL("src/app/favicon.ico", root))).toBe(true);
    expect(existsSync(new URL("src/app/icon.tsx", root))).toBe(true);
    expect(existsSync(new URL("src/app/apple-icon.tsx", root))).toBe(true);
    expect(existsSync(new URL("public/images/site/hero-ornament.svg", root))).toBe(true);
  });
});
