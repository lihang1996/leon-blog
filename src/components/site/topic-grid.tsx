import Link from "next/link";
import type { PublicCategoryDTO } from "@/modules/category";

/**
 * Major categories on the home page (UI spec §9). Two columns on mobile,
 * horizontal on desktop. Icons are decorative — the category name is the
 * readable label.
 */
export function TopicGrid({ categories }: { categories: PublicCategoryDTO[] }) {
  if (categories.length === 0) return null;

  return (
    <section className="py-16">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif-cn text-2xl font-bold md:text-3xl">主要分类</h2>
        <Link href="/categories" className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent">
          全部分类 →
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/categories/${category.slug}`}
            className="focus-surface group flex flex-col gap-1 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent-text"
          >
            <span className="font-medium text-text group-hover:text-accent-text">{category.name}</span>
            <span className="text-xs text-text-muted">{category.postCount} 篇文章</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
