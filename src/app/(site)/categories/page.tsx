import type { Metadata } from "next";
import Link from "next/link";
import { categoryService } from "@/modules/category";
import { buildMetadata } from "@/lib/seo";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "分类",
  description: "按分类浏览 Leon 的文章。",
  path: "/categories",
});

export default async function CategoriesPage() {
  const categories = await categoryService.listPublicCategories();

  return (
    <div className="py-12">
      <h1 className="font-serif-cn text-3xl font-bold md:text-4xl">分类</h1>
      <p className="mt-3 text-text-muted">按主题浏览全部文章</p>

      {categories.length > 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/categories/${category.slug}`}
              className="focus-surface group flex flex-col gap-2 rounded-lg border border-border bg-surface p-6 transition-colors hover:border-accent-text"
            >
              <span className="font-serif-cn text-lg font-bold text-text group-hover:text-accent-text">
                {category.name}
              </span>
              {category.description ? (
                <span className="text-sm text-text-muted">{category.description}</span>
              ) : null}
              <span className="text-xs text-text-muted">{category.postCount} 篇文章</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="暂无分类" description="还没有已发布的分类内容。" action={{ href: "/posts", label: "浏览全部文章" }} />
        </div>
      )}
    </div>
  );
}
