import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { postQueryService } from "@/modules/post";
import { siteContent } from "@/config/site-content";
import { siteUrl } from "@/lib/env";
import { buildMetadata, jsonLd, buildPersonJsonLd, buildBreadcrumbJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/format";
import { MarkdownContent } from "@/components/site/markdown-content";
import { CategoryLink } from "@/components/site/category-link";
import { Tag } from "@/components/site/tag";

type Props = { params: Promise<{ slug: string }> };

/**
 * Dynamic-segment pages read `params`, so under Cache Components they are
 * Partial Prerenders: the (site) shell ships as a 200 and the page streams
 * behind it. As a result `notFound()` renders the 404 UI with a 200 status —
 * a documented Next 16.3 behavior (the content is correct and no draft data
 * leaks; the API layer still returns real 404s). `instant = false` keeps these
 * routes blocking (no instant-navigation validation).
 */
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await postQueryService.getPublishedPostBySlug(slug);
  if (!post) notFound();
  return buildMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    path: `/posts/${post.slug}`,
    image: post.seoImageUrl ?? post.coverImageUrl,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await postQueryService.getPublishedPostBySlug(slug);
  if (!post) notFound();

  const url = `${siteUrl}/posts/${post.slug}`;
  const person = buildPersonJsonLd(post.author.displayName, post.author.avatarUrl);
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription ?? post.excerpt,
    image: post.seoImageUrl ?? post.coverImageUrl,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.author.displayName },
    publisher: { "@type": "Person", name: siteContent.author.name },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
  const breadcrumbItems = [
    { name: "首页", path: "/" },
    ...(post.category ? [{ name: post.category.name, path: `/categories/${post.category.slug}` }] : []),
    { name: post.title, path: `/posts/${post.slug}` },
  ];

  return (
    <article className="py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(person) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(buildBreadcrumbJsonLd(breadcrumbItems)) }} />
      <div className="mx-auto max-w-read">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          {post.category ? <CategoryLink {...post.category} /> : null}
        </div>
        <h1 className="mt-4 font-serif-cn text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-text-muted md:text-lg">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Tag key={tag.slug} {...tag} />
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-10">
          <MarkdownContent content={post.contentMd} />
        </div>
      </div>
    </article>
  );
}
