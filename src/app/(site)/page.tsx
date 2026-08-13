import Link from "next/link";
import { postQueryService } from "@/modules/post";
import { categoryService } from "@/modules/category";
import { siteContent } from "@/config/site-content";
import { HomeHero } from "@/components/site/home-hero";
import { TopicGrid } from "@/components/site/topic-grid";
import { ProjectEvidence } from "@/components/site/project-evidence";
import { ArticleRow } from "@/components/site/article-row";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = {
  description: siteContent.home.hero.lead,
};

export default async function HomePage() {
  const [latest, categories] = await Promise.all([
    postQueryService.listLatestPublishedPosts(5),
    categoryService.listPublicCategories(),
  ]);

  return (
    <>
      <HomeHero latestPostSlug={latest[0]?.slug ?? null} hasPosts={latest.length > 0} />

      <TopicGrid categories={categories} />

      <section className="py-16">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif-cn text-2xl font-bold md:text-3xl">最新文章</h2>
          <Link
            href="/posts"
            className="focus-link text-sm text-accent-text underline underline-offset-4 hover:text-accent"
          >
            全部文章 →
          </Link>
        </div>
        {latest.length > 0 ? (
          <div className="mt-4">
            {latest.map((post, index) => (
              <ArticleRow key={post.slug} post={post} showExcerpt={index === 0} />
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="还没有文章"
              description="作者正在创作中，敬请期待第一篇发布。"
              action={{ href: "/posts", label: "浏览全部文章" }}
            />
          </div>
        )}
      </section>

      <ProjectEvidence />
    </>
  );
}
