"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  CatMagnifier,
  CatSleep,
  WavyDivider,
  SparkleStar,
  PawIcon,
} from "../ui/cat-doodles";
import { clientApi, PostItem, getPostTags } from "@/lib/client-api";

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="rounded bg-[#F9D490]/80 px-0.5 text-inherit">{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>;
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<PostItem[]>([]);
  const [searchTime, setSearchTime] = useState(0.02);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const executeSearch = async (searchTerm: string, targetPage = 1) => {
    const normalizedTerm = searchTerm.trim().slice(0, 50);
    if (!normalizedTerm) {
      setQuery("");
      setActiveQuery("");
      setResults([]);
      setSearched(false);
      setPage(1);
      window.history.replaceState(null, "", "/search");
      return;
    }

    setLoading(true);
    setQuery(normalizedTerm);
    setActiveQuery(normalizedTerm);
    const searchUrl = new URL(window.location.href);
    searchUrl.searchParams.set("q", normalizedTerm);
    if (targetPage > 1) searchUrl.searchParams.set("page", String(targetPage));
    else searchUrl.searchParams.delete("page");
    window.history.replaceState(null, "", `${searchUrl.pathname}${searchUrl.search}`);
    const start = performance.now();
    try {
      const [res] = await Promise.all([
        clientApi.searchPosts(normalizedTerm, { page: targetPage, pageSize: 6 }),
        new Promise((r) => setTimeout(r, 200)),
      ]);
      const end = performance.now();
      setSearchTime(Math.max(0.01, Number(((end - start) / 1000).toFixed(2))));
      setSearched(true);
      setPage(targetPage);

      if (res.data) {
        setResults(res.data);
        if (res.meta) {
          setTotalPages(res.meta.totalPages || 1);
          setTotalResults(res.meta.total);
        } else {
          setTotalResults(res.data.length);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q) {
        queueMicrotask(() => {
          setQuery(q);
          void executeSearch(q);
        });
      }
    }
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch(query);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/search" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-8 animate-tab-fade">
        {/* Page Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="page-title font-extrabold font-serif text-[#1A1A1A]">
              搜索
            </h1>
            <div className="flex items-center gap-1 text-[#F9D490]">
              <SparkleStar className="w-5 h-5 text-[#E65A00]" />
              <SparkleStar className="w-4 h-4 text-[#F9D490]" />
            </div>
          </div>
          <p className="text-sm sm:text-base text-[#6B655C]">
            搜索标题与摘要
          </p>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-3xl">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={50}
              placeholder="输入关键词..."
              className="w-full pl-5 pr-12 py-3.5 text-sm sm:text-base rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:border-[#E65A00] focus:outline-none"
            />
            {loading ? (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <svg className="animate-spin w-5 h-5 text-[#E65A00]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#8C8375] hover:text-[#E65A00] hover:bg-[#FFF5EE] transition-colors cursor-pointer"
                title="清空搜索内容"
                aria-label="清空搜索内容"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8C8375] pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            )}
          </div>
          <Button type="submit" size="lg" disabled={loading} className="px-8 shrink-0">
            {loading ? "搜索中..." : "搜索"}
          </Button>
        </form>

        {/* Results Stats */}
        {searched && (
          <div className="text-xs sm:text-sm text-[#8C8375] font-medium">
            “{activeQuery}” 找到 {totalResults} 篇结果（用时 {searchTime} 秒）
          </div>
        )}

        {/* Content Layout: Results (Left) + Cat Magnifier Illustration (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Results List with min-height */}
          <div className="lg:col-span-8 w-full min-h-[480px]">
            {!searched && !loading ? (
              <div className="w-full paper-card-dashed p-10 sm:p-14 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]">
                <CatMagnifier className="w-36 h-auto lg:hidden" />
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">输入一个关键词开始寻找</h3>
                <p className="text-sm text-[#8C8375]">可以试试 Next.js、TypeScript 或工程化。</p>
              </div>
            ) : loading ? (
              /* Loading Skeleton */
              <div className="space-y-8 animate-pulse pt-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="space-y-3">
                    <div className="w-20 h-4 bg-[#EAE2D5] rounded-full" />
                    <div className="w-3/4 h-6 bg-[#EAE2D5] rounded-lg" />
                    <div className="w-full h-4 bg-[#EAE2D5] rounded-md" />
                    <div className="flex gap-2 pt-1">
                      <div className="w-16 h-5 bg-[#EAE2D5] rounded-full" />
                      <div className="w-16 h-5 bg-[#EAE2D5] rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-6">
                {results.map((post, idx) => (
                  <div key={post.slug || post.id || idx} className="space-y-6">
                    <article className="group relative">
                      <div className="flex items-start gap-4">
                        {/* Date on Left */}
                        <div className="hidden sm:flex flex-col items-start gap-1 w-24 shrink-0 pt-1">
                          <div className="flex items-center gap-1.5 text-xs text-[#8C8375] font-mono">
                            <svg className="w-3.5 h-3.5 text-[#E65A00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{post.publishedAt ? post.publishedAt.slice(0, 10) : "2024-05-18"}</span>
                          </div>
                        </div>

                        {/* Title, Excerpt & Tags */}
                        <div className="flex-1 space-y-2">
                          <Link href={`/posts/${post.slug}`}>
                            <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors leading-snug">
                              <HighlightText text={post.title} query={activeQuery} />
                            </h2>
                          </Link>
                          <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed line-clamp-2">
                            <HighlightText text={post.excerpt} query={activeQuery} />
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
                          className="hidden sm:flex self-center w-8 h-8 rounded-full items-center justify-center text-[#E65A00] hover:bg-[#FFF5EE] transition-transform group-hover:translate-x-1"
                        >
                          <span className="text-lg font-bold">→</span>
                        </Link>
                      </div>
                    </article>

                    {idx < results.length - 1 && (
                      <div className="py-1">
                        <WavyDivider className="w-full h-3 text-[#D8C7B0]" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Pagination */}
                <div className="flex items-center justify-center gap-4 pt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => void executeSearch(activeQuery, page - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => void executeSearch(activeQuery, page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full paper-card-dashed p-10 sm:p-14 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]">
                <CatSleep className="w-48 h-36" />
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">没有找到相关文章</h3>
                <Link href="/posts" className="text-sm font-bold text-[#E65A00] hover:underline">
                  浏览全部文章 →
                </Link>
              </div>
            )}
          </div>

          {/* Right Column: Cat Magnifier Illustration & Sparkles */}
          <div className="hidden lg:flex lg:col-span-4 flex-col items-center justify-center pt-8 relative w-full">
            <div className="relative">
              {/* Sparkle stars and paw prints */}
              <div className="absolute -top-6 -left-6 text-[#F9D490]">
                <SparkleStar className="w-6 h-6" />
              </div>
              <div className="absolute top-12 -right-8 text-[#E65A00]">
                <SparkleStar className="w-5 h-5" />
              </div>
              <div className="absolute -bottom-6 -left-4 flex items-center gap-2 opacity-60">
                <PawIcon className="w-3.5 h-3.5 text-[#E65A00] transform -rotate-12" />
                <PawIcon className="w-4 h-4 text-[#E65A00] transform rotate-15" />
                <PawIcon className="w-3.5 h-3.5 text-[#E65A00] transform -rotate-6" />
              </div>

              <CatMagnifier className="w-52 h-64" />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
