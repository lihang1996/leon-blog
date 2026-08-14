import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { isPageOutOfRange, normalizePageParams } from "@/lib/pagination";
import { buildMetadata, hasPublishedTaxonomy } from "@/lib/seo";
import { ArticleRow } from "@/components/site/article-row";
import { Pagination } from "@/components/site/pagination";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

/**
 * See the note on /posts/[slug] — dynamic segments are Partial Prerenders, so
 * `notFound()` renders 404 content with a 200 status under cacheComponents.
 */
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await categoryService.getPublicCategoryBySlug(slug);
  if (!hasPublishedTaxonomy(category)) notFound();
  return buildMetadata({
    title: `分类：${category.name}`,
    description: category.description ?? `浏览「${category.name}」分类下的文章。`,
    path: `/categories/${category.slug}`,
  });
}

export default async function CategoryPostsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await categoryService.getPublicCategoryBySlug(slug);
  if (!hasPublishedTaxonomy(category)) notFound();

  const query = await searchParams;
  const { page, pageSize } = normalizePageParams({ page: query.page });
  const { items, pagination } = await postQueryService.listPostsByCategory(slug, { page, pageSize });

  // Out-of-range ?page= → canonical last page (FIND-207).
  if (isPageOutOfRange(page, pagination.totalPages)) {
    redirect(pagination.totalPages <= 1 ? `/categories/${slug}` : `/categories/${slug}?page=${pagination.totalPages}`);
  }

  return (
    <div className="py-12">
      <Link href="/categories" className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent">
        ← 全部分类
      </Link>
      <h1 className="mt-4 font-serif-cn text-3xl font-bold md:text-4xl">{category.name}</h1>
      {category.description ? <p className="mt-3 text-text-muted">{category.description}</p> : null}
      <p className="mt-1 text-sm text-text-muted">共 {category.postCount} 篇文章</p>

      {items.length > 0 ? (
        <div className="mt-8">
          {items.map((post) => (
            <ArticleRow key={post.slug} post={post} headingLevel="h2" />
          ))}
          <Pagination
            pagination={pagination}
            makeHref={(pageNumber) =>
              pageNumber === 1 ? `/categories/${slug}` : `/categories/${slug}?page=${pageNumber}`
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="该分类下暂无文章" action={{ href: "/posts", label: "浏览全部文章" }} />
        </div>
      )}
    </div>
  );
}
