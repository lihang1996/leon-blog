import { notFound } from "next/navigation";
import Link from "next/link";
import { postQueryService } from "@/modules/post";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/api/admin-id";
import { formatDate } from "@/lib/format";
import { MarkdownContent } from "@/components/site/markdown-content";
import { CategoryLink } from "@/components/site/category-link";
import { Tag } from "@/components/site/tag";
import { previewBannerLabel } from "@/components/admin/preview-banner";

type Props = { params: Promise<{ id: string }> };

/**
 * Protected draft preview (architecture §6.4 / §12.4). Admin-only, noindex
 * (inherited from the admin layout) and never in the public cache. Reuses the
 * public MarkdownContent so the preview matches the final rendering.
 */
export default async function PreviewPostPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const post = await postQueryService.getAdminPost(id);
  if (!post) notFound();

  const tags = post.tags ?? [];

  return (
    <div className="mx-auto max-w-blog px-page">
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
          {previewBannerLabel(post.status)}
        </span>
        <span className="flex-1" />
        <Link
          href={`/admin/posts/${post.id}/edit`}
          className="focus-action-secondary inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-4 text-sm text-text transition-colors hover:border-accent-text"
        >
          返回编辑
        </Link>
      </div>

      <article className="py-12">
        <div className="mx-auto max-w-read">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
            {post.publishedAt ? <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> : <span>未发布 · 草稿</span>}
            {post.category ? <CategoryLink {...post.category} /> : null}
          </div>
          <h1 className="mt-4 font-serif-cn text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-text-muted md:text-lg">{post.excerpt}</p>
          {tags.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Tag key={tag.slug} {...tag} />
              ))}
            </div>
          ) : null}
          <div className="mt-10 border-t border-border pt-10">
            <MarkdownContent content={post.contentMd} />
          </div>
        </div>
      </article>
    </div>
  );
}
