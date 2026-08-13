import Link from "next/link";
import { siteContent } from "@/config/site-content";

/**
 * Home hero (UI spec §9): author positioning + two CTAs. "阅读最新文章" targets
 * the newest published post; with no published posts it falls back to
 * "浏览文章" → /posts. The secondary action is fixed to "查看全部文章" → /posts.
 */
export function HomeHero({ latestPostSlug, hasPosts }: { latestPostSlug: string | null; hasPosts: boolean }) {
  const { hero } = siteContent.home;

  return (
    <section className="py-16 md:py-24">
      <h1 className="max-w-2xl font-serif-cn text-4xl font-bold leading-tight md:text-6xl">{hero.heading}</h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-text-muted md:text-lg">{hero.lead}</p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        {hasPosts && latestPostSlug ? (
          <Link
            href={`/posts/${latestPostSlug}`}
            className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-text"
          >
            阅读最新文章
          </Link>
        ) : (
          <Link
            href="/posts"
            className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-text"
          >
            浏览文章
          </Link>
        )}
        <Link
          href="/posts"
          className="focus-action-secondary inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-text transition-colors hover:border-accent-text hover:text-accent-text"
        >
          查看全部文章
        </Link>
      </div>
    </section>
  );
}
