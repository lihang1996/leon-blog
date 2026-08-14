import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  siteName: "Leon 的博客",
  siteUrl: "https://leon.example.com",
}));

import {
  buildMetadata,
  defaultOgImage,
  jsonLd,
  buildPersonJsonLd,
  buildBreadcrumbJsonLd,
  hasPublishedTaxonomy,
} from "@/lib/seo";

describe("buildMetadata", () => {
  it("emits Open Graph and Twitter Card with the same image strategy", () => {
    const meta = buildMetadata({
      title: "一篇文章",
      description: "摘要",
      path: "/posts/hello",
      type: "article",
    });
    expect(meta.openGraph?.images).toEqual([
      { url: defaultOgImage, width: 1200, height: 630, alt: "一篇文章" },
    ]);
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "一篇文章",
      description: "摘要",
      images: [defaultOgImage],
    });
    expect(meta.alternates?.canonical).toBe("https://leon.example.com/posts/hello");
  });

  it("uses the provided cover image for both OG and Twitter", () => {
    const image = "https://images.example.com/cover.png";
    const meta = buildMetadata({
      title: "封面文章",
      description: "d",
      path: "/posts/cover",
      image,
    });
    expect((meta.openGraph?.images as { url: string }[])[0]?.url).toBe(image);
    expect(meta.twitter?.images).toEqual([image]);
  });

  it("builds homepage metadata with canonical root and absolute title", () => {
    const meta = buildMetadata({
      title: "Leon 的博客",
      description: "导语",
      path: "/",
      absoluteTitle: true,
    });
    expect(meta.title).toEqual({ absolute: "Leon 的博客" });
    expect(meta.description).toBe("导语");
    expect(meta.alternates?.canonical).toBe("https://leon.example.com/");
    expect(meta.twitter).toEqual(
      expect.objectContaining({
        card: "summary_large_image",
      }),
    );
  });
});

describe("jsonLd / Person / BreadcrumbList", () => {
  it("escapes < to block script injection", () => {
    expect(jsonLd({ headline: "a <script>alert(1)</script>" })).toContain("\\u003c");
    expect(jsonLd({ headline: "a <script>alert(1)</script>" })).not.toContain("<script>");
  });

  it("builds an independent Person node", () => {
    expect(buildPersonJsonLd("Leon", "https://example.com/a.png")).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Leon",
      image: "https://example.com/a.png",
    });
  });

  it("builds BreadcrumbList 首页 → 分类 → 文章", () => {
    const data = buildBreadcrumbJsonLd([
      { name: "首页", path: "/" },
      { name: "前端", path: "/categories/frontend" },
      { name: "Hello", path: "/posts/hello" },
    ]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "首页", item: "https://leon.example.com/" },
      { "@type": "ListItem", position: 2, name: "前端", item: "https://leon.example.com/categories/frontend" },
      { "@type": "ListItem", position: 3, name: "Hello", item: "https://leon.example.com/posts/hello" },
    ]);
  });
});

describe("hasPublishedTaxonomy", () => {
  it("matches generateMetadata and page notFound: missing or zero posts", () => {
    expect(hasPublishedTaxonomy(null)).toBe(false);
    expect(hasPublishedTaxonomy({ postCount: 0 })).toBe(false);
    expect(hasPublishedTaxonomy({ postCount: 3 })).toBe(true);
  });
});
