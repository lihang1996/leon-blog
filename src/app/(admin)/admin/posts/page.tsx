import Link from "next/link";
import { redirect } from "next/navigation";
import { postQueryService, postStatusQuerySchema, POST_STATUSES } from "@/modules/post";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageOutOfRange, normalizePageParams } from "@/lib/pagination";
import { formatDate } from "@/lib/format";
import { PostStatusBadge } from "@/components/admin/post-status-badge";
import { adminPostsHref } from "@/components/admin/admin-posts-href";

type Props = {
  searchParams: Promise<{ status?: string | string[]; page?: string | string[] }>;
};

const FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "全部" },
  ...POST_STATUSES.map((status) => ({ value: status, label: status === "DRAFT" ? "草稿" : status === "PUBLISHED" ? "已发布" : "已归档" })),
];

export default async function AdminPostsPage({ searchParams }: Props) {
  await requireAdmin();

  const query = await searchParams;
  // Unknown/array `?status=` must not throw into the error boundary (500); the
  // API layer returns 422 for the same input — here we degrade gracefully to ALL.
  const parsedStatus = postStatusQuerySchema.safeParse({ status: query.status });
  const status = parsedStatus.success ? parsedStatus.data.status : "ALL";
  const { page, pageSize } = normalizePageParams({ page: query.page });
  const { items, pagination } = await postQueryService.listAdminPosts({ page, pageSize }, status);

  const filterHref = (value: string) => adminPostsHref(value, 1);
  const pageHref = adminPostsHref;

  if (isPageOutOfRange(page, pagination.totalPages)) {
    redirect(pageHref(status, pagination.totalPages));
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">文章</h1>
        <Link
          href="/admin/posts/new"
          className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-text"
        >
          新建文章
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="按状态筛选">
        {FILTERS.map((filter) => {
          const active = status === filter.value;
          return (
            <Link
              key={filter.value}
              href={filterHref(filter.value)}
              aria-current={active ? "page" : undefined}
              className={`focus-surface inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-text hover:border-accent-text hover:text-accent-text"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">标题</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">分类</th>
              <th className="px-4 py-3 font-medium">更新于</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-bg/50">
                  <td className="max-w-[280px] px-4 py-3">
                    <Link href={`/admin/posts/${item.id}/edit`} className="focus-link-strong font-medium text-text hover:text-accent-text">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <PostStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-text-muted">{item.categoryName ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDate(item.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-sm">
                      <Link href={`/admin/posts/${item.id}/edit`} className="focus-link text-accent-text underline underline-offset-4 hover:text-accent">
                        编辑
                      </Link>
                      <Link href={`/admin/posts/${item.id}/preview`} target="_blank" className="focus-link text-text-muted underline underline-offset-4 hover:text-accent-text">
                        预览
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-text-muted">
                  {status === "ALL" ? "还没有文章，点击“新建文章”开始创作。" : "该状态下没有文章。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 ? (
        <nav aria-label="分页" className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={pageHref(status, page - 1)} className="focus-surface rounded-md px-3 py-2 text-accent-text underline underline-offset-4">
              上一页
            </Link>
          ) : null}
          <span aria-current="page" className="rounded-md bg-bg px-2 py-1 font-medium text-text-muted">
            第 {page} / {pagination.totalPages} 页
          </span>
          {page < pagination.totalPages ? (
            <Link href={pageHref(status, page + 1)} className="focus-surface rounded-md px-3 py-2 text-accent-text underline underline-offset-4">
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
