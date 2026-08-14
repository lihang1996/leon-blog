import type { Metadata } from "next";
import { siteName, siteUrl } from "@/lib/env";
import { siteContent } from "@/config/site-content";

/**
 * SEO helpers (architecture §15). One metadata builder for every public page:
 * canonical, Open Graph and article timestamps. `defaultOgImage` is the shared
 * fallback share image.
 */
export const defaultOgImage = new URL(siteContent.defaultOgImagePath, siteUrl).toString();

type MetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  /** Skip the root `%s · siteName` template (homepage already *is* the site name). */
  absoluteTitle?: boolean;
};

export function buildMetadata(input: MetadataInput): Metadata {
  const url = new URL(input.path, siteUrl);
  const image = input.image ?? defaultOgImage;
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url.toString() },
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: input.title,
      description: input.description,
      url: url.toString(),
      siteName,
      type: input.type ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

/** Serialize JSON-LD safely — escape `<` to block script injection (§15.4). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildPersonJsonLd(name: string, image?: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(image ? { image } : {}),
  };
}

export function buildBreadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, siteUrl).toString(),
    })),
  };
}

/** Public category/tag pages 404 when missing or when no published posts. */
export function hasPublishedTaxonomy<T extends { postCount: number }>(
  entity: T | null,
): entity is T {
  return entity != null && entity.postCount > 0;
}
