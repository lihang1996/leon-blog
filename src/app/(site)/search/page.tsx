import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { postQueryService, type PublicPostSummaryDTO } from "@/modules/post";
import { isPageOutOfRange, normalizePageParams } from "@/lib/pagination";
import { buildMetadata } from "@/lib/seo";
import { SearchField } from "@/components/site/search-field";
import { ArticleRow } from "@/components/site/article-row";
import { Pagination } from "@/components/site/pagination";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "搜索",
  description: "搜索 Leon 博客中的文章。",
  path: "/search",
});

type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const query = await searchParams;
  const raw = Array.isArray(query.q) ? query.q[0] : query.q;
  const keyword = raw?.trim().slice(0, 50) ?? "";

  let items: PublicPostSummaryDTO[] = [];
  let pagination: Awaited<ReturnType<typeof postQueryService.listPublishedPosts>>["pagination"] | null = null;
  if (keyword) {
    const { page, pageSize } = normalizePageParams({ page: query.page });
    const result = await postQueryService.searchPublishedPosts(keyword, { page, pageSize });
    items = result.items;
    pagination = result.pagination;

    // Out-of-range ?page= → canonical last page, preserving the keyword (FIND-207).
    if (pagination && isPageOutOfRange(page, pagination.totalPages)) {
      redirect(
        pagination.totalPages <= 1
          ? `/search?q=${encodeURIComponent(keyword)}`
          : `/search?q=${encodeURIComponent(keyword)}&page=${pagination.totalPages}`,
      );
    }
  }

  return (
    <div className="py-12">
      <h1 className="font-serif-cn text-3xl font-bold md:text-4xl">搜索</h1>
      <p className="mt-3 text-text-muted">搜索标题与摘要</p>

      <div className="mt-6 max-w-xl">
        <SearchField defaultValue={keyword} />
      </div>

      {keyword ? (
        <>
          <p className="mt-10 text-sm text-text-muted">
            “{keyword}” 的搜索结果{pagination ? `：共 ${pagination.total} 篇` : ""}
          </p>
          {items.length > 0 ? (
            <div className="mt-4">
              {items.map((post) => (
                <ArticleRow key={post.slug} post={post} headingLevel="h2" />
              ))}
              {pagination ? (
                <Pagination
                  pagination={pagination}
                  makeHref={(pageNumber) =>
                    pageNumber === 1
                      ? `/search?q=${encodeURIComponent(keyword)}`
                      : `/search?q=${encodeURIComponent(keyword)}&page=${pageNumber}`
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="没有找到相关文章"
                description="换个关键词试试，或浏览全部文章。"
                action={{ href: "/posts", label: "浏览全部文章" }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="mt-10">
          <EmptyState title="输入关键词开始搜索" description="支持标题与摘要的关键词匹配。" />
        </div>
      )}
    </div>
  );
}
