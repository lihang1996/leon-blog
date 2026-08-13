import Link from "next/link";
import type { PublicPostSummaryDTO } from "@/modules/post";
import { formatDate } from "@/lib/format";
import { CategoryLink } from "@/components/site/category-link";
import { Tag } from "@/components/site/tag";

/**
 * Article list row (UI spec §8.1): date, category, title, optional excerpt,
 * tags. Divider-list layout — no card shadow. `headingLevel` lets listing pages
 * keep a continuous heading hierarchy (h1 → h2 → …) instead of skipping levels.
 */
export function ArticleRow({
  post,
  showExcerpt = false,
  headingLevel = "h3",
}: {
  post: PublicPostSummaryDTO;
  showExcerpt?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <article className="border-b border-border py-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        {post.category ? <CategoryLink {...post.category} /> : null}
      </div>
      <Heading className="mt-2 font-serif-cn text-xl font-bold leading-snug md:text-2xl">
        <Link href={`/posts/${post.slug}`} className="focus-link-strong text-text hover:text-accent-text">
          {post.title}
        </Link>
      </Heading>
      {showExcerpt ? <p className="mt-2 text-sm leading-relaxed text-text-muted md:text-base">{post.excerpt}</p> : null}
      {post.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Tag key={tag.slug} {...tag} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
