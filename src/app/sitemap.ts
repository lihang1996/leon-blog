import type { MetadataRoute } from "next";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { siteUrl } from "@/lib/env";

/**
 * Sitemap (architecture §15.2). Only public pages: home, post list, category &
 * tag indexes, published posts, and categories/tags that have published posts.
 * Never admin, login, preview, API, drafts or archived posts.
 *
 * Post lists are capped at 50 per page, so the sitemap iterates every page of
 * published posts to guarantee it never silently omits entries.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/posts`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/categories`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/tags`, changeFrequency: "weekly", priority: 0.6 },
  ];

  try {
    const [firstPage, categories, tags] = await Promise.all([
      postQueryService.listPublishedPosts({ page: 1, pageSize: 50 }),
      categoryService.listPublicCategories(),
      tagService.listPublicTags(),
    ]);

  // Collect every published post across paginated pages (pageSize is clamped
  // to 50 by the query service, so we keep stepping until fully drained).
  const allPosts = [...firstPage.items];
  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    const { items } = await postQueryService.listPublishedPosts({ page, pageSize: 50 });
    allPosts.push(...items);
  }

  for (const post of allPosts) {
    entries.push({
      url: `${siteUrl}/posts/${post.slug}`,
      // lastModified should reflect content edits, not first publication
      // (FIND-212 fix).
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }
  for (const category of categories) {
    entries.push({ url: `${siteUrl}/categories/${category.slug}`, changeFrequency: "weekly", priority: 0.5 });
  }
  for (const tag of tags) {
    entries.push({ url: `${siteUrl}/tags/${tag.slug}`, changeFrequency: "weekly", priority: 0.5 });
  }
  } catch {
    // Return base entries if DB is not reachable during static build
  }

  return entries;
}
