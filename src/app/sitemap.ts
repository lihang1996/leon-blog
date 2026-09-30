import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { readSitemapSnapshot } from "@/modules/sitemap/sitemap.snapshot";

/**
 * Sitemap (architecture §15.2 / FR-23). Only public pages: home, post list,
 * category & tag indexes, published posts, and categories/tags. Never admin,
 * login, preview, API, drafts or archived posts.
 *
 * All data comes from ONE RepeatableRead snapshot (see sitemap.snapshot.ts):
 * the paginated traversal cannot produce a mixed state, and beyond-50-post
 * sets are fully drained. **A failed read fails the whole route** — during
 * static generation the build fails; a cold dynamic request yields a
 * non-2xx. Returning the base entries on DB failure (the previous behavior)
 * fabricated a truncated "successful" sitemap, which FR-23 explicitly
 * forbids. If Next.js serves a previously cached complete snapshot after a
 * failed regeneration, that stale-while-revalidate behavior belongs to the
 * framework — this route never marks a partial result as a new success.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await readSitemapSnapshot();

  const entries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/posts`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/categories`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/tags`, changeFrequency: "weekly", priority: 0.6 },
  ];

  for (const post of snapshot.posts) {
    entries.push({
      url: `${siteUrl}/posts/${post.slug}`,
      // lastModified reflects content edits, not first publication (FIND-212).
      lastModified: post.updatedAt,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }
  for (const slug of snapshot.categorySlugs) {
    entries.push({ url: `${siteUrl}/categories/${slug}`, changeFrequency: "weekly", priority: 0.5 });
  }
  for (const slug of snapshot.tagSlugs) {
    entries.push({ url: `${siteUrl}/tags/${slug}`, changeFrequency: "weekly", priority: 0.5 });
  }
  return entries;
}
