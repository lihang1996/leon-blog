"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InitialData } from "@/app/site-shell";
import { normalizePublicQuery, publicQueryHref } from "@/lib/public-query";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge, CategoryBadge } from "../ui/badge";
import { CustomSelect, SelectOption } from "../ui/select";
import { PawIcon, WavyDivider, CatSleep, CatPeekSidebar, PostDocIcon, SparkleStar } from "../ui/cat-doodles";
import { getPostTags } from "@/lib/client-api";
import { Button } from "../ui/button";
import { formatDate } from "@/lib/format";

export function PostsView({ initialData }: { initialData?: InitialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSearching, startTransition] = useTransition();
  const query = initialData?.query ?? normalizePublicQuery({});
  const posts = initialData?.posts ?? [];
  const categories = initialData?.categories ?? [];
  const tags = initialData?.tags ?? [];
  const page = query.page;
  const totalPages = initialData?.pagination?.totalPages ?? 1;
  const selectedCategory = query.category || "ALL";
  const selectedTag = query.tag || "ALL";
  // Only the unsubmitted input is local. Results and filters always come from
  // the current server props, including refresh and browser back/forward.
  const queryKey = JSON.stringify(query);
  const [draft, setDraft] = useState({ source: queryKey, value: query.q });
  if (draft.source !== queryKey) setDraft({ source: queryKey, value: query.q });
  const keyword = draft.source === queryKey ? draft.value : query.q;
  const navigate = (changes: Record<string, string | number | undefined>) => {
    startTransition(() => router.push(publicQueryHref("/posts", new URLSearchParams(searchParams.toString()), changes), { scroll: false }));
  };
  const handleCategoryChange = (value: string) => navigate({ category: value === "ALL" ? undefined : value, page: 1 });
  const handleTagChange = (value: string) => navigate({ tag: value === "ALL" ? undefined : value, page: 1 });
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = keyword.trim().slice(0, 50);
    setDraft({ source: queryKey, value: q });
    navigate({ q, page: 1 });
  };
  const clearSearch = () => {
    setDraft({ source: queryKey, value: "" });
    navigate({ q: undefined, page: 1 });
  };
  const displayTags = tags.map((t) => ({ name: t.name, slug: t.slug, count: t.postCount || 0 }));
  const categoryOptions: SelectOption[] = [
    { value: "ALL", label: "所有分类" },
    ...categories.map((c) => ({ value: c.slug, label: c.name, count: c.postCount })),
  ];
  const tagOptions: SelectOption[] = [
    { value: "ALL", label: "所有标签" },
    ...tags.map((t) => ({ value: t.slug, label: t.name, count: t.postCount })),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/posts" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10 animate-tab-fade">
        {/* Page Title — redesign-posts-desktop.png */}
        <div className="flex items-center gap-3">
          <h1 className="page-title font-extrabold font-serif text-[#1A1A1A]">
            全部文章
          </h1>
          <div className="relative flex items-center text-[#E65A00]" aria-hidden="true">
            <PawIcon className="w-9 h-9" />
            <SparkleStar className="absolute -top-2 -right-3 w-3.5 h-3.5 text-[#E65A00]" />
            <SparkleStar className="absolute -bottom-1 -left-2 w-2.5 h-2.5 text-[#F9D490]" />
          </div>
        </div>

        {/* Filters Bar: 分类 → 标签 → 搜索 */}
        <div className="flex flex-wrap items-center gap-5">
          <CustomSelect
            value={selectedCategory}
            onChange={handleCategoryChange}
            options={categoryOptions}
            placeholder="所有分类"
          />

          <CustomSelect
            value={selectedTag}
            onChange={handleTagChange}
            options={tagOptions}
            placeholder="所有标签"
          />

          <CustomSelect
            value={query.sort}
            onChange={(sort) => navigate({ sort, page: 1 })}
            options={[{ value: "latest", label: "最新发布" }, { value: "updated", label: "最近更新" }]}
          />

          {/* Search input with loading animation */}
          <form onSubmit={submitSearch} className="flex-1 min-w-[200px] relative">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setDraft({ source: queryKey, value: e.target.value })}
              aria-label="搜索标题或摘要"
              placeholder="搜索标题或摘要（最多 50 字）..."
              maxLength={50}
              className="w-full pl-4 pr-24 py-2 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none shadow-xs transition-colors"
            />
            <button type="submit" disabled={isSearching} className="absolute right-10 top-1/2 -translate-y-1/2 text-xs font-bold text-[#E65A00] cursor-pointer disabled:opacity-50">搜索</button>
            {isSearching ? (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <svg className="animate-spin w-4 h-4 text-[#E65A00]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : keyword.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[#8C8375] hover:text-[#E65A00] hover:bg-[#FFF5EE] transition-colors cursor-pointer"
                title="清空搜索内容"
                aria-label="清空搜索内容"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <svg
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8375] pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            )}
          </form>
        </div>

        {/* Content Layout: Posts List (Left 8) + Sidebar (Right 4) with stable column widths */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Post items list with min-height to prevent layout jump */}
          <div className="lg:col-span-8 min-w-0 w-full min-h-[480px]" aria-busy={isSearching}>
            {isSearching ? (
              /* Loading Skeleton */
              <div className="space-y-8 animate-pulse pt-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-4 bg-[#EAE2D5] rounded-full" />
                      <div className="w-14 h-4 bg-[#EAE2D5] rounded-full" />
                    </div>
                    <div className="w-3/4 h-6 bg-[#EAE2D5] rounded-lg" />
                    <div className="w-full h-4 bg-[#EAE2D5] rounded-md" />
                    <div className="flex gap-2 pt-1">
                      <div className="w-16 h-5 bg-[#EAE2D5] rounded-full" />
                      <div className="w-16 h-5 bg-[#EAE2D5] rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length > 0 ? (
              <div className="space-y-5">
                {posts.map((post, idx) => (
                  <div key={post.slug || post.id || idx} className="space-y-5">
                    {/*
                      redesign-posts-desktop.png row:
                      [doc] [category] [title ........] [→]
                      [date]           [excerpt ......]
                                       [tags .........]
                    */}
                    <article className="group relative">
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Left: doc icon + date */}
                        <div className="hidden sm:flex flex-col items-center gap-1.5 w-[4.5rem] shrink-0 pt-0.5">
                          <PostDocIcon className="w-10 h-10" />
                          <span className="text-[11px] text-[#8C8375] font-mono whitespace-nowrap">
                            {formatDate(post.publishedAt)}
                          </span>
                        </div>

                        {/* Middle: category + title/excerpt/tags */}
                        <div className="flex-1 min-w-0 flex items-start gap-3">
                          {post.category && (
                            <div className="hidden sm:block w-24 max-w-24 min-w-0 shrink-0 pt-1">
                              <CategoryBadge
                                name={post.category.name}
                                href={`/categories/${post.category.slug}`}
                                className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 sm:hidden text-xs text-[#8C8375] font-mono">
                              <span>{formatDate(post.publishedAt)}</span>
                              {post.category && <span>· {post.category.name}</span>}
                            </div>

                            <Link href={`/posts/${post.slug}`}>
                              <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors leading-snug">
                                {post.title}
                              </h2>
                            </Link>
                            <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed line-clamp-2">
                              {post.excerpt}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {getPostTags(post).slice(0, 4).map((tag) => (
                                <TagBadge
                                  key={tag.slug}
                                  name={tag.name}
                                  href={`/tags/${tag.slug}`}
                                  size="sm"
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right arrow */}
                        <Link
                          href={`/posts/${post.slug}`}
                          className="hidden sm:flex self-center shrink-0 w-8 h-8 items-center justify-center text-[#E65A00] transition-transform group-hover:translate-x-1"
                          aria-label={`阅读 ${post.title}`}
                        >
                          <span className="text-xl font-bold leading-none">→</span>
                        </Link>
                      </div>
                    </article>

                    {idx < posts.length - 1 && (
                      <div className="pl-0 sm:pl-[4.5rem]">
                        <WavyDivider className="w-full h-3 text-[#D8C7B0]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Beautiful Empty State Card matching the exact column bounds */
              <div className="w-full paper-card-dashed p-10 sm:p-14 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px]">
                <CatSleep className="w-48 h-36" />
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  没有找到相关文章
                </h3>
                <p className="text-xs sm:text-sm text-[#6B655C]">
                  尝试更换筛选条件或搜索关键词
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ source: queryKey, value: "" });
                    navigate({ category: undefined, tag: undefined, q: undefined, page: 1 });
                  }}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-[#E65A00] hover:bg-[#FFF5EE] rounded-full border border-[#E65A00] transition-colors cursor-pointer mt-2"
                >
                  清空筛选条件
                </button>
              </div>
            )}
            {!isSearching && totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-8">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>
                  上一页
                </Button>
                <span className="text-xs font-semibold text-[#6B655C]">第 {page} / {totalPages} 页</span>
                <Button size="sm" disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 })}>
                  下一页
                </Button>
              </div>
            )}
          </div>

          {/* Right Sidebar: solid card, tags without #, per redesign-posts-desktop.png */}
          <div className="lg:col-span-4 w-full">
            <aside className="paper-card p-5 sm:p-6 space-y-5 relative overflow-hidden">
              <div className="relative inline-block">
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  热门标签
                </h3>
                <SparkleStar className="absolute -top-1 -right-5 w-3.5 h-3.5 text-[#E65A00]" />
                <svg
                  className="mt-1 h-2 w-16 text-[#E65A00]"
                  viewBox="0 0 60 8"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 5C18 3 42 2.5 58 5.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {displayTags.slice(0, 17).map((tag) => (
                  <TagBadge
                    key={tag.slug}
                    name={tag.name}
                    count={tag.count}
                    href={`/tags/${tag.slug}`}
                    size="sm"
                    showHash={false}
                    className="justify-between w-full"
                  />
                ))}
              </div>

              <div className="pt-2 flex items-center justify-center select-none">
                <CatPeekSidebar className="w-56 h-auto" />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
