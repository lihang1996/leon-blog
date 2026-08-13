import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { postQueryService } from "@/modules/post";
import { isPageOutOfRange, normalizePageParams } from "@/lib/pagination";
import { buildMetadata } from "@/lib/seo";
import { ArticleRow } from "@/components/site/article-row";
import { Pagination } from "@/components/site/pagination";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "全部文章",
  description: "Leon 的全部技术文章与学习笔记，按发布时间倒序浏览。",
  path: "/posts",
});

type Props = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function PostsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { page, pageSize } = normalizePageParams({ page: params.page });
  const { items, pagination } = await postQueryService.listPublishedPosts({ page, pageSize });

  // Out-of-range ?page= → canonical last page (FIND-207).
  if (isPageOutOfRange(page, pagination.totalPages)) {
    redirect(pagination.totalPages <= 1 ? "/posts" : `/posts?page=${pagination.totalPages}`);
  }

  return (
    <div className="py-12">
      <h1 className="font-serif-cn text-3xl font-bold md:text-4xl">全部文章</h1>
      <p className="mt-3 text-text-muted">共 {pagination.total} 篇文章</p>

      {items.length > 0 ? (
        <div className="mt-8">
          {items.map((post) => (
            <ArticleRow key={post.slug} post={post} headingLevel="h2" />
          ))}
          <Pagination
            pagination={pagination}
            makeHref={(pageNumber) => (pageNumber === 1 ? "/posts" : `/posts?page=${pageNumber}`)}
          />
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="还没有文章" description="作者正在创作中，敬请期待。" action={{ href: "/", label: "返回首页" }} />
        </div>
      )}
    </div>
  );
}
