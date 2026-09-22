"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InitialData } from "@/app/site-shell";
import { normalizePublicQuery, publicQueryHref } from "@/lib/public-query";
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
import { getPostTags } from "@/lib/client-api";
import { formatDateDash } from "@/lib/format";

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="rounded bg-[#F9D490]/80 px-0.5 text-inherit">{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>;
}

export function SearchView({ initialData }: { initialData?: InitialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, startTransition] = useTransition();
  const normalizedQuery = initialData?.query ?? normalizePublicQuery({}, 6);
  const activeQuery = normalizedQuery.q;
  const results = initialData?.posts ?? [];
  const page = normalizedQuery.page;
  const totalPages = initialData?.pagination?.totalPages ?? 1;
  const totalResults = initialData?.pagination?.total ?? 0;
  const searched = Boolean(activeQuery);
  const queryKey = JSON.stringify(normalizedQuery);
  const [draft, setDraft] = useState({ source: queryKey, value: activeQuery });
  if (draft.source !== queryKey) setDraft({ source: queryKey, value: activeQuery });
  const query = draft.source === queryKey ? draft.value : activeQuery;
  const executeSearch = (searchTerm: string, targetPage = 1) => {
    const q = searchTerm.trim().slice(0, 50);
    setDraft({ source: queryKey, value: q });
    startTransition(() => router.push(publicQueryHref("/search", new URLSearchParams(searchParams.toString()), {
      q,
      page: q ? targetPage : 1,
    }), { scroll: false }));
  };
  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
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
              onChange={(e) => setDraft({ source: queryKey, value: e.target.value })}
              aria-label="搜索标题与摘要"
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
                onClick={() => {
                  setDraft({ source: queryKey, value: "" });
                  executeSearch("");
                }}
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
          <div className="text-xs sm:text-sm text-[#8C8375] font-medium" aria-live="polite">
            “{activeQuery}” 找到 {totalResults} 篇结果
          </div>
        )}

        {/* Content Layout: Results (Left) + Cat Magnifier Illustration (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Results List with min-height */}
          <div className="lg:col-span-8 min-w-0 w-full min-h-[480px]" aria-busy={loading}>
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
                            <span>{formatDateDash(post.publishedAt)}</span>
                          </div>
                        </div>

                        {/* Title, Excerpt & Tags */}
                        <div className="flex-1 min-w-0 space-y-2">
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

                {/* Pagination: 上一页 outlined + 下一页 solid, per redesign-search-desktop.png */}
                <div className="flex items-center justify-center gap-3 pt-6">
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
                <Button href="/posts" variant="outline" size="sm" className="mt-2">
                  浏览全部文章 →
                </Button>
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
