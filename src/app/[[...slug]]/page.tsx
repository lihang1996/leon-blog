import { Suspense } from "react";
import SiteShell, { type InitialData } from "../site-shell";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { normalizePostItem } from "@/lib/client-api";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/api/admin-id";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveLoginState } from "@/lib/auth/login-state";
import { computePagination } from "@/lib/pagination";
import { firstQueryValue, normalizePublicQuery, publicPageRedirect, type PublicSearchParams } from "@/lib/public-query";
import type { Metadata } from "next";
import { siteName, siteUrl } from "@/lib/env";
import { AppError, ErrorCodes } from "@/lib/errors";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const parts = (await params).slug ?? [];
  const [first, second] = parts;
  const canonical = new URL(`/${parts.map(encodeURIComponent).join("/")}`, siteUrl).toString();

  if (first === "admin") return { title: "管理后台", robots: { index: false, follow: false } };
  if (first === "search") return { title: "搜索", robots: { index: false, follow: true } };
  if (!first) return { title: { absolute: siteName }, alternates: { canonical: siteUrl } };
  if (first === "posts" && !second) return { title: "文章", alternates: { canonical } };
  if (first === "categories" && !second) return { title: "分类", alternates: { canonical } };
  if (first === "tags" && !second) return { title: "标签", alternates: { canonical } };

  try {
    if (first === "posts" && second) {
      const post = await postQueryService.getPublishedPostBySlug(second);
      if (!post) return { title: "文章不存在", robots: { index: false, follow: false } };
      const title = post.seoTitle || post.title;
      const description = post.seoDescription || post.excerpt;
      const images = post.seoImageUrl || post.coverImageUrl;
      return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
          type: "article",
          title,
          description,
          url: canonical,
          publishedTime: post.publishedAt,
          modifiedTime: post.updatedAt,
          ...(images ? { images: [{ url: images }] } : {}),
        },
      };
    }
    if (first === "categories" && second) {
      const category = await categoryService.getPublicCategoryBySlug(second);
      return category
        ? { title: category.name, description: category.description ?? `浏览${category.name}分类文章`, alternates: { canonical } }
        : { title: "分类不存在", robots: { index: false, follow: false } };
    }
    if (first === "tags" && second) {
      const tag = await tagService.getPublicTagBySlug(second);
      return tag
        ? { title: `#${tag.name}`, description: `浏览标签 ${tag.name} 下的文章`, alternates: { canonical } }
        : { title: "标签不存在", robots: { index: false, follow: false } };
    }
  } catch {
    // Metadata failure must not replace otherwise renderable content.
  }
  return {};
}

type CatchAllPageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<PublicSearchParams>;
};

export default function CatchAllPage(props: CatchAllPageProps) {
  return (
    <Suspense fallback={<main className="page-container min-h-screen py-12 text-[#8C8375]" role="status">正在加载...</main>}>
      <RouteContent {...props} />
    </Suspense>
  );
}

async function RouteContent({ params, searchParams }: CatchAllPageProps) {
  const parts = (await params).slug ?? [];
  const [first, second, third, fourth] = parts;

  const isKnownPublicRoute =
    parts.length === 0 ||
    (first === "posts" && parts.length <= 2) ||
    (first === "categories" && parts.length <= 2) ||
    (first === "tags" && parts.length <= 2) ||
    (first === "search" && parts.length === 1);
  const isKnownAdminRoute =
    first === "admin" &&
    (parts.length === 1 ||
      (parts.length === 2 && ["login", "dashboard", "posts", "categories", "tags"].includes(second ?? "")) ||
      (parts.length === 3 && second === "posts" && third === "new") ||
      (parts.length === 4 && second === "posts" && isUuid(third ?? "") && ["edit", "preview"].includes(fourth ?? "")));

  if (!isKnownPublicRoute && !isKnownAdminRoute) notFound();

  if (first === "admin") {
    if (second === "login") {
      const query = await searchParams;
      const loginState = await resolveLoginState({
        reason: firstQueryValue(query.reason),
        callbackUrl: firstQueryValue(query.callbackUrl),
      });
      return <SiteShell route="login" initialData={{ loginState }} />;
    }
    try {
      await requireAdmin();
    } catch (error) {
      const isAuthFailure = error instanceof AppError && [
        ErrorCodes.AUTH_REQUIRED,
        ErrorCodes.AUTH_INVALID,
        ErrorCodes.ADMIN_DISABLED,
      ].some((code) => code === error.code);
      if (!isAuthFailure) throw error;
      // `reason=expired` lets the login page clear the stale JWT; without it the
      // proxy would see a still-valid cookie and bounce back to /admin forever.
      const callbackUrl = `/${parts.map(encodeURIComponent).join("/")}`;
      redirect(`/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}&reason=expired`);
    }
    // Admin and login must never fall through into public data fetching.
    if (second === "posts") {
      if (third === "new") return <SiteShell route="admin:posts:new" />;
      if (third && fourth === "edit") return <SiteShell route={`admin:posts-edit:${third}`} />;
      if (third && fourth === "preview") return <SiteShell route={`admin:posts-preview:${third}`} />;
      return <SiteShell route="admin:posts" />;
    }
    if (second === "categories") return <SiteShell route="admin:categories" />;
    if (second === "tags") return <SiteShell route="admin:tags" />;
    return <SiteShell route="admin:dashboard" />;
  }

  if (!first) {
    const [result, categories] = await Promise.all([
      postQueryService.listPublishedPosts({ page: 1, pageSize: 4 }),
      categoryService.listPublicCategories(),
    ]);
    return <SiteShell route="home" initialData={{
      posts: result.items.map(normalizePostItem),
      totalPosts: result.pagination.total,
      categories,
    }} />;
  }

  if (first === "posts" && second) {
    const post = await postQueryService.getPublishedPostBySlug(second);
    if (!post) notFound();
    const neighbor = await postQueryService.getPublishedNeighbor(second);
    return <SiteShell route={`post-detail:${second}`} initialData={{
      postDetail: normalizePostItem(post),
      nextPost: neighbor ? normalizePostItem(neighbor) : undefined,
    }} />;
  }

  if (first === "categories" && !second) {
    return <SiteShell route="categories" initialData={{ categories: await categoryService.listPublicCategories() }} />;
  }
  if (first === "tags" && !second) {
    return <SiteShell route="tags" initialData={{ tags: await tagService.listPublicTags() }} />;
  }

  // Only list routes read query parameters. Fetch the exact requested page;
  // correct out-of-range URLs before rendering instead of showing false empties.
  const rawQuery = await searchParams;
  const query = normalizePublicQuery(first === "posts" ? rawQuery : {
    page: rawQuery.page,
    pageSize: rawQuery.pageSize,
    ...(first === "search" ? { q: rawQuery.q } : {}),
  }, first === "posts" ? 10 : 6);
  const pathname = `/${parts.map(encodeURIComponent).join("/")}`;
  const listData = (result: Awaited<ReturnType<typeof postQueryService.listPublishedPosts>>): InitialData => {
    const target = publicPageRedirect(pathname, rawQuery, result.pagination);
    if (target) redirect(target);
    return { posts: result.items.map(normalizePostItem), pagination: result.pagination, query };
  };

  if (first === "posts") {
    const [result, categories, tags] = await Promise.all([
      postQueryService.listPublishedPosts(query, {
        categorySlug: query.category || undefined,
        tagSlug: query.tag || undefined,
        keyword: query.q || undefined,
        sort: query.sort,
      }),
      categoryService.listPublicCategories(),
      tagService.listPublicTags(),
    ]);
    return <SiteShell route="posts" initialData={{ ...listData(result), categories, tags }} />;
  }
  if (first === "categories" && second) {
    const category = await categoryService.getPublicCategoryBySlug(second);
    if (!category) notFound();
    const [result, categories] = await Promise.all([
      postQueryService.listPostsByCategory(second, query),
      categoryService.listPublicCategories(),
    ]);
    return <SiteShell route={`category-detail:${second}`} initialData={{ ...listData(result), category, categories }} />;
  }
  if (first === "tags" && second) {
    const tag = await tagService.getPublicTagBySlug(second);
    if (!tag) notFound();
    const [result, tags] = await Promise.all([
      postQueryService.listPostsByTag(second, query),
      tagService.listPublicTags(),
    ]);
    return <SiteShell route={`tag-detail:${second}`} initialData={{ ...listData(result), tag, tags }} />;
  }
  if (first === "search") {
    const result = query.q
      ? await postQueryService.searchPublishedPosts(query.q, query)
      : { items: [], pagination: computePagination(query.page, query.pageSize, 0) };
    return <SiteShell route="search" initialData={listData(result)} />;
  }
  notFound();
}
