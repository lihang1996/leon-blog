"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge, CategoryBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { CategoryIllustratedIcon, WavyDivider, CatPeek, CatSleep } from "../ui/cat-doodles";
import { clientApi, PostItem, CategoryItem, getPostTags } from "@/lib/client-api";

// Fallback categories cache with full metadata so SSR matches DB instantly
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: "c-fe", name: "前端", slug: "frontend", description: "现代前端技术与架构实践", postCount: 1 },
  { id: "c-be", name: "后端", slug: "backend", description: "API、数据库与服务器端设计", postCount: 1 },
  { id: "c-ts", name: "TypeScript", slug: "typescript", description: "类型系统与工程化实践", postCount: 1 },
];

export function CategoryDetailView({
  slug: initialSlug,
  initialData,
}: {
  slug: string;
  initialData?: {
    categories?: CategoryItem[];
    posts?: PostItem[];
  };
}) {
  const [currentSlug, setCurrentSlug] = useState<string>(initialSlug);
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    initialData?.categories && initialData.categories.length > 0 ? initialData.categories : DEFAULT_CATEGORIES
  );
  const [posts, setPosts] = useState<PostItem[]>(() => {
    if (initialData?.posts && initialData.posts.length > 0) {
      return initialData.posts.filter((p) => p.category?.slug === initialSlug);
    }
    return [];
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Support browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/\/categories\/([^/?#]+)/);
      if (match && match[1]) {
        setCurrentSlug(decodeURIComponent(match[1]));
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch all categories for sidebar
  useEffect(() => {
    clientApi.getCategories().then((res) => {
      if (res.data && res.data.length > 0) {
        setCategories(res.data);
      }
    });
  }, []);

  // Fetch posts whenever the selected category or page changes.
  useEffect(() => {
    let active = true;
    void clientApi.getPostsByCategory(currentSlug, { page, pageSize: 6 }).then((res) => {
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

  // In-page smooth category switch
  const handleSelectCategory = useCallback((newSlug: string) => {
    if (newSlug === currentSlug) return;
    setLoading(true);
    setCurrentSlug(newSlug);
    setPage(1);
    window.history.pushState(null, "", `/categories/${newSlug}`);
  }, [currentSlug]);

  const category = categories.find((item) => item.slug === currentSlug) ?? null;
  const catName = category?.name || (currentSlug === "backend" ? "后端" : currentSlug === "frontend" ? "前端" : decodeURIComponent(currentSlug));
  const catDesc = category?.description || "Next.js、TypeScript 与全栈实践笔记。";
  const catCount = category?.postCount ?? posts.length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/categories" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10 animate-tab-fade">
        {/* Back link */}
        <div>
          <Link
            href="/categories"
            scroll={false}
            className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-1"
          >
            <span>← 全部分类</span>
          </Link>
        </div>

        {/* Category Header Card */}
        <div className="flex items-start gap-5">
          <div className="w-36 sm:w-44 shrink-0">
            <CategoryIllustratedIcon iconKey="dev" className="w-full h-auto" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h1 className="text-4xl sm:text-5xl font-extrabold font-serif text-[#1A1A1A] transition-all">
              {catName}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B655C]">
              {catDesc}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-[#8C8375] font-medium pt-1">
              <svg className="w-3.5 h-3.5 text-[#E65A00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>共 {catCount} 篇文章</span>
            </div>
          </div>
        </div>

        {/* Content Layout: Posts List (Left) + Sidebar (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Post items list with fixed-bottom pagination */}
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
                            <CategoryBadge name={catName} />
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
                                  href={`/tags/${tag.slug}`}
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

                {/* Fixed-bottom Pagination */}
                <div className="flex items-center justify-center gap-4 pt-8 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => {
                      setLoading(true);
                      setPage(page - 1);
                    }}
                  >
                    上一页
                  </Button>
                  <span className="text-xs sm:text-sm font-bold text-[#6B655C]">
                    第 {page} / {totalPages || 1} 页
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setLoading(true);
                      setPage(page + 1);
                    }}
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
                <h3 className="text-lg font-bold text-[#1A1A1A]">该分类下暂无文章</h3>
                <Link href="/posts" scroll={false} className="text-xs font-bold text-[#E65A00] hover:underline">
                  浏览全部文章 →
                </Link>
              </div>
            )}
          </div>

          {/* Right Sidebar: Other Categories (Kept fully static without re-mounting) */}
          <div className="lg:col-span-4 w-full">
            <aside className="paper-card-dashed p-6 space-y-6 relative overflow-hidden bg-white/70">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  同类目录
                </h3>
                <span className="text-[#E65A00] text-sm">´</span>
              </div>

              {/* Other Categories List with in-page smooth click */}
              <div className="space-y-2">
                {categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => handleSelectCategory(c.slug)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full border text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-left ${
                      c.slug === currentSlug
                        ? "bg-[#FFF5EE] border-[#E65A00] text-[#E65A00]"
                        : "bg-white border-[#D5C7B2] text-[#3A332C] hover:border-[#E65A00]"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-[#8C8375]">{c.postCount || 0}</span>
                  </button>
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
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
