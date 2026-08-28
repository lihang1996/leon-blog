import SiteShell from "../site-shell";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { normalizePostItem, type CategoryItem, type PostItem, type TagItem } from "@/lib/client-api";
import { notFound } from "next/navigation";

export const instant = false;

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const parts = (await params).slug ?? [];
  const [first, second, third, fourth] = parts;

  // Pre-fetch real data for SSR to eliminate any flash on refresh
  let initialPosts: PostItem[] = [];
  let initialCategories: CategoryItem[] = [];
  let initialTags: TagItem[] = [];
  let initialPostDetail: PostItem | undefined;

  try {
    const [catsRes, tagsRes] = await Promise.all([
      categoryService.listPublicCategories(),
      tagService.listPublicTags(),
    ]);
    initialCategories = (catsRes || []).map((category) => ({
      ...category,
      id: category.slug,
    }));
    initialTags = (tagsRes || []).map((tag) => ({
      ...tag,
      id: tag.slug,
    }));

    if (first === "categories" && second) {
      // Category detail page
      const catPostsRes = await postQueryService.listPostsByCategory(second, { page: 1, pageSize: 6 });
      initialPosts = (catPostsRes.items || []).map((item) => normalizePostItem({
        ...item,
        postTags: (item.tags || []).map((t) => ({ tag: t })),
      }));
    } else if (first === "tags" && second) {
      // Tag detail page
      const tagPostsRes = await postQueryService.listPostsByTag(second, { page: 1, pageSize: 6 });
      initialPosts = (tagPostsRes.items || []).map((item) => normalizePostItem({
        ...item,
        postTags: (item.tags || []).map((t) => ({ tag: t })),
      }));
    } else if (first === "posts" && second) {
      // Post detail page
      const detail = await postQueryService.getPublishedPostBySlug(second);
      if (detail) {
        initialPostDetail = normalizePostItem({
          ...detail,
          postTags: (detail.tags || []).map((t) => ({ tag: t })),
        });
      }
    } else {
      // Home / Posts index
      const postsRes = await postQueryService.listPublishedPosts({ page: 1, pageSize: 50 });
      initialPosts = (postsRes.items || []).map((item) => normalizePostItem({
        ...item,
        postTags: (item.tags || []).map((t) => ({ tag: t })),
      }));
    }
  } catch {
    // Fallback gracefully during offline build
  }

  const initialData = {
    posts: initialPosts,
    categories: initialCategories,
    tags: initialTags,
    postDetail: initialPostDetail,
  };

  // Home: /
  if (parts.length === 0) {
    return <SiteShell route="home" initialData={initialData} />;
  }

  // Admin routes
  if (first === "admin") {
    if (second === "login") {
      return <SiteShell route="login" initialData={initialData} />;
    }
    if (!second || second === "dashboard") {
      return <SiteShell route="admin:dashboard" initialData={initialData} />;
    }
    if (second === "posts") {
      if (third === "new") {
        return <SiteShell route="admin:posts:new" initialData={initialData} />;
      }
      if (third && fourth === "edit") {
        return <SiteShell route={`admin:posts-edit:${third}`} initialData={initialData} />;
      }
      if (third && fourth === "preview") {
        return <SiteShell route={`admin:posts-preview:${third}`} initialData={initialData} />;
      }
      return <SiteShell route="admin:posts" initialData={initialData} />;
    }
    if (second === "categories") {
      return <SiteShell route="admin:categories" initialData={initialData} />;
    }
    if (second === "tags") {
      return <SiteShell route="admin:tags" initialData={initialData} />;
    }
    return <SiteShell route="admin:dashboard" initialData={initialData} />;
  }

  // Posts: /posts or /posts/[slug]
  if (first === "posts") {
    if (second) {
      return <SiteShell route={`post-detail:${second}`} initialData={initialData} />;
    }
    return <SiteShell route="posts" initialData={initialData} />;
  }

  // Categories: /categories or /categories/[slug]
  if (first === "categories") {
    if (second) {
      return <SiteShell route={`category-detail:${second}`} initialData={initialData} />;
    }
    return <SiteShell route="categories" initialData={initialData} />;
  }

  // Tags: /tags or /tags/[slug]
  if (first === "tags") {
    if (second) {
      return <SiteShell route={`tag-detail:${second}`} initialData={initialData} />;
    }
    return <SiteShell route="tags" initialData={initialData} />;
  }

  // Search: /search
  if (first === "search") {
    return <SiteShell route="search" initialData={initialData} />;
  }

  // Fallback 404
  notFound();
}
