import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { postQueryService } from "@/modules/post";
import { tagService } from "@/modules/tag";
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
  const tag = await tagService.getPublicTagBySlug(slug);
  if (!hasPublishedTaxonomy(tag)) notFound();
  return buildMetadata({
    title: `标签：#${tag.name}`,
    description: `浏览带有「${tag.name}」标签的文章。`,
    path: `/tags/${tag.slug}`,
  });
}

export default async function TagPostsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const tag = await tagService.getPublicTagBySlug(slug);
  if (!hasPublishedTaxonomy(tag)) notFound();

  const query = await searchParams;
  const { page, pageSize } = normalizePageParams({ page: query.page });
  const { items, pagination } = await postQueryService.listPostsByTag(slug, { page, pageSize });

  // Out-of-range ?page= → canonical last page (FIND-207).
  if (isPageOutOfRange(page, pagination.totalPages)) {
    redirect(pagination.totalPages <= 1 ? `/tags/${slug}` : `/tags/${slug}?page=${pagination.totalPages}`);
  }

  return (
    <div className="py-12">
      <Link href="/tags" className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent">
        ← 全部标签
      </Link>
      <h1 className="mt-4 font-serif-cn text-3xl font-bold md:text-4xl">#{tag.name}</h1>
      <p className="mt-1 text-sm text-text-muted">共 {tag.postCount} 篇文章</p>

      {items.length > 0 ? (
        <div className="mt-8">
          {items.map((post) => (
            <ArticleRow key={post.slug} post={post} headingLevel="h2" />
          ))}
          <Pagination
            pagination={pagination}
            makeHref={(pageNumber) =>
              pageNumber === 1 ? `/tags/${slug}` : `/tags/${slug}?page=${pageNumber}`
            }
          />
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="该标签下暂无文章" action={{ href: "/posts", label: "浏览全部文章" }} />
        </div>
      )}
    </div>
  );
}
