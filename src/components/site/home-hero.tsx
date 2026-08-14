import Link from "next/link";
import Image from "next/image";
import { siteContent } from "@/config/site-content";

/**
 * Home hero (UI spec §9): author positioning + two CTAs + a decorative image
 * that carries no unique information (hidden below 768px).
 */
export function HomeHero({ latestPostSlug, hasPosts }: { latestPostSlug: string | null; hasPosts: boolean }) {
  const { hero } = siteContent.home;

  return (
    <section className="relative py-16 md:py-24">
      <Image
        src="/images/site/hero-ornament.svg"
        alt=""
        width={420}
        height={320}
        priority
        className="pointer-events-none absolute right-0 top-8 hidden h-auto w-[min(42%,420px)] md:block"
      />
      <div className="relative max-w-2xl">
        <h1 className="font-serif-cn text-4xl font-bold leading-tight md:text-6xl">{hero.heading}</h1>
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
      </div>
    </section>
  );
}
