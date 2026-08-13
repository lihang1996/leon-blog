import Link from "next/link";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { tagService } from "@/modules/tag";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDate } from "@/lib/format";
import { PostStatusBadge } from "@/components/admin/post-status-badge";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [posts, categories, tags] = await Promise.all([
    postQueryService.listAdminPosts({ page: 1, pageSize: 5 }, "ALL"),
    categoryService.listAdminCategories(),
    tagService.listAdminTags(),
  ]);

  const totalPosts = posts.pagination.total;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif-cn text-2xl font-bold md:text-3xl">概览</h1>
        <Link
          href="/admin/posts/new"
          className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-text"
        >
          新建文章
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">文章总数</p>
          <p className="mt-1 font-serif-cn text-3xl font-bold text-text">{totalPosts}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">分类</p>
          <p className="mt-1 font-serif-cn text-3xl font-bold text-text">{categories.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">标签</p>
          <p className="mt-1 font-serif-cn text-3xl font-bold text-text">{tags.length}</p>
        </div>
      </div>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif-cn text-xl font-bold text-text">最近更新</h2>
          <Link href="/admin/posts" className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent">
            全部文章 →
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="px-4 py-3 font-medium">标题</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">更新于</th>
              </tr>
            </thead>
            <tbody>
              {posts.items.length > 0 ? (
                posts.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/posts/${item.id}/edit`} className="focus-link text-text hover:text-accent-text">
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PostStatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(item.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                    还没有文章，点击右上角“新建文章”开始创作。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
