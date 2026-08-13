import type { Metadata } from "next";
import Link from "next/link";
import { tagService } from "@/modules/tag";
import { buildMetadata } from "@/lib/seo";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "标签",
  description: "按标签浏览 Leon 的文章。",
  path: "/tags",
});

export default async function TagsPage() {
  const tags = await tagService.listPublicTags();

  return (
    <div className="py-12">
      <h1 className="font-serif-cn text-3xl font-bold md:text-4xl">标签</h1>
      <p className="mt-3 text-text-muted">按标签发现相关文章</p>

      {tags.length > 0 ? (
        <div className="mt-10 flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag.slug}
              href={`/tags/${tag.slug}`}
              className="focus-surface inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text transition-colors hover:border-accent-text hover:text-accent-text"
            >
              #{tag.name}
              <span className="text-xs text-text-muted">{tag.postCount}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState title="暂无标签" description="还没有带标签的已发布文章。" action={{ href: "/posts", label: "浏览全部文章" }} />
        </div>
      )}
    </div>
  );
}
