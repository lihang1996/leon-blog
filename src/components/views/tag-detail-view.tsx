"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge, CategoryBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { WavyDivider, CatPeek, CatSleep } from "../ui/cat-doodles";
import { clientApi, PostItem, TagItem, getPostTags } from "@/lib/client-api";

// Fallback tags cache so sidebar never renders empty initially
const DEFAULT_TAGS: TagItem[] = [
  { id: "t-perf", name: "性能", slug: "perf", postCount: 2 },
  { id: "t-nextjs", name: "Next.js", slug: "nextjs", postCount: 1 },
  { id: "t-pg", name: "PostgreSQL", slug: "postgresql", postCount: 1 },
  { id: "t-prisma", name: "Prisma", slug: "prisma", postCount: 1 },
  { id: "t-react", name: "React", slug: "react", postCount: 2 },
  { id: "t-ts", name: "TypeScript", slug: "typescript", postCount: 1 },
];

export function TagDetailView({
  slug: initialSlug,
  initialData,
}: {
  slug: string;
  initialData?: {
    tags?: TagItem[];
    posts?: PostItem[];
  };
}) {
  const [currentSlug, setCurrentSlug] = useState<string>(initialSlug);
  const [tags, setTags] = useState<TagItem[]>(() =>
    initialData?.tags && initialData.tags.length > 0 ? initialData.tags : DEFAULT_TAGS
  );
  const [posts, setPosts] = useState<PostItem[]>(() => {
    if (initialData?.posts && initialData.posts.length > 0) {
      return initialData.posts.filter((p) => p.postTags?.some((pt) => pt.tag.slug === initialSlug));
    }
    return [];
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Support browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/\/tags\/([^/?#]+)/);
      if (match && match[1]) {
        setCurrentSlug(decodeURIComponent(match[1]));
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch all tags for sidebar (keep existing tags on error)
  useEffect(() => {
    clientApi.getTags().then((res) => {
      if (res.data && res.data.length > 0) {
        setTags(res.data);
      }
    });
  }, []);

  // Fetch posts whenever the selected tag or page changes.
  useEffect(() => {
    let active = true;
    void clientApi.getPostsByTag(currentSlug, { page, pageSize: 6 }).then((res) => {
      if (!active) return;
      if (res.data) {
        setPosts(res.data);
        if (res.meta) {
          setTotalPages(res.meta.totalPages || 1);
        }
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [currentSlug, page]);

  // In-page smooth tag switch
  const handleSelectTag = useCallback((newSlug: string) => {
    if (newSlug === currentSlug) return;
    setLoading(true);
    setCurrentSlug(newSlug);
    setPage(1);
    window.history.pushState(null, "", `/tags/${newSlug}`);
  }, [currentSlug]);

  const tag = tags.find((item) => item.slug === currentSlug) ?? null;
  const tagName = tag?.name || decodeURIComponent(currentSlug);
  const tagCount = tag?.postCount ?? posts.length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/tags" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10">
        {/* Back link */}
        <div>
          <Link
            href="/tags"
            scroll={false}
            className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-1"
          >
            <span>← 全部标签</span>
          </Link>
        </div>

        {/* Tag Header with large badge */}
        <div className="space-y-3">
          <div className="inline-block">
            <span className="inline-flex items-center px-6 py-2 rounded-full border-2 border-[#E65A00] bg-white text-[#E65A00] font-bold text-4xl sm:text-5xl tracking-tight shadow-xs transition-all">
              #{tagName}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#8C8375] font-medium pl-1">
            共 {tagCount} 篇文章
          </p>
        </div>

        {/* Content Layout: Posts List (Left) + Sidebar (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Post items list with stable min-height & fixed-bottom pagination */}
          <div className="lg:col-span-8 w-full min-h-[480px] flex flex-col justify-between">
            {posts.length > 0 ? (
              <div className={`flex-1 flex flex-col justify-between transition-opacity duration-150 ${loading ? "opacity-30" : "opacity-100"}`}>
                <div className="space-y-6">
                  {posts.map((post, idx) => (
                    <div key={post.slug || post.id || idx} className="space-y-6">
                      <article className="group relative">
                        <div className="flex items-start gap-4">
                          {/* Date & Category on Left */}
                          <div className="hidden sm:flex flex-col items-start gap-2 w-28 shrink-0 pt-1">
                            <div className="flex items-center gap-1.5 text-xs text-[#8C8375] font-mono">
                              <svg className="w-3.5 h-3.5 text-[#E65A00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>{post.publishedAt ? post.publishedAt.slice(0, 10) : "2024-05-20"}</span>
                            </div>
                            {post.category && (
                              <CategoryBadge name={post.category.name} href={`/categories/${post.category.slug}`} />
                            )}
                          </div>

                          {/* Middle */}
                          <div className="flex-1 space-y-2">
                            <Link href={`/posts/${post.slug}`} scroll={false}>
                              <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors leading-snug">
                                {post.title}
                              </h2>
                            </Link>
                            <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed line-clamp-2">
                              {post.excerpt}
                            </p>

                            {/* Tags row */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {getPostTags(post).map((tag) => (
                                <TagBadge
                                  key={tag.slug}
                                  name={tag.name}
                                  onClick={() => handleSelectTag(tag.slug)}
                                  active={tag.slug === currentSlug}
                                  size="sm"
                                />
                              ))}
                            </div>
                          </div>

                          {/* Right Orange Arrow */}
                          <Link
                            href={`/posts/${post.slug}`}
                            scroll={false}
                            className="hidden sm:flex self-center w-8 h-8 rounded-full items-center justify-center text-[#E65A00] hover:bg-[#FFF5EE] transition-transform group-hover:translate-x-1"
                          >
                            <span className="text-lg font-bold">→</span>
                          </Link>
                        </div>
                      </article>

                      {idx < posts.length - 1 && (
                        <div className="py-1">
                          <WavyDivider className="w-full h-3 text-[#D8C7B0]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Fixed-bottom pagination aligned with bottom of sidebar */}
                <div className="flex items-center justify-center gap-2 pt-8 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    上一页
                  </Button>
                  {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                        p === page
                          ? "bg-[#E65A00] text-white"
                          : "border border-[#D5C7B2] bg-white text-[#3A332C] hover:border-[#E65A00]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : loading ? (
              <div className="space-y-8 animate-pulse pt-4 my-auto">
                <div className="w-48 h-6 bg-[#EAE2D5] rounded-lg" />
                <div className="w-full h-4 bg-[#EAE2D5] rounded-md" />
              </div>
            ) : (
              <div className="w-full paper-card-dashed p-10 sm:p-14 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px] my-auto">
                <CatSleep className="w-44 h-32" />
                <h3 className="text-lg font-bold text-[#1A1A1A]">该标签下暂无文章</h3>
                <Link href="/posts" scroll={false} className="text-xs font-bold text-[#E65A00] hover:underline">
                  浏览全部文章 →
                </Link>
              </div>
            )}
          </div>

          {/* Right Sidebar: Related Tags (Kept fully static without re-mounting) */}
          <div className="lg:col-span-4 w-full">
            <aside className="paper-card-dashed p-6 space-y-6 relative overflow-hidden bg-white/70">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  相关标签
                </h3>
                <span className="text-[#E65A00] text-sm">´</span>
              </div>

              {/* Tags Grid with in-page smooth click */}
              <div className="grid grid-cols-2 gap-2">
                {tags.map((t) => (
                  <TagBadge
                    key={t.slug}
                    name={t.name}
                    count={t.postCount}
                    onClick={() => handleSelectTag(t.slug)}
                    active={t.slug === currentSlug}
                    size="sm"
                    className="justify-between w-full"
                  />
                ))}
              </div>

              {/* Bottom Peeking Cat */}
              <div className="pt-4 flex items-end justify-between border-t border-[#F0E6D8] relative">
                <div className="w-12 h-16">
                  <svg viewBox="0 0 50 70" fill="none">
                    <path d="M12 40L15 65H35L38 40H12Z" fill="#FFFDF8" stroke="#4A2B11" strokeWidth="2" />
                    <path d="M25 38C20 25 10 18 5 22C0 26 10 32 25 38Z" fill="#5B7B5A" stroke="#4A2B11" strokeWidth="1.6" />
                  </svg>
                </div>
                <div className="flex-1 flex justify-center">
                  <CatPeek className="w-28 h-20" speech="喵~" />
                </div>
                <div className="w-8 h-8 text-[#E65A00] pb-2">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
