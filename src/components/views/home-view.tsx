"use client";

import React from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { Button } from "../ui/button";
import { CategoryBadge, TagBadge } from "../ui/badge";
import {
  CatHero,
  CategoryIllustratedIcon,
  HomePostRowIcon,
  SparkleStar,
  ProjectEvidenceWindow,
  OutlineStar,
  TitleBrushUnderline,
} from "../ui/cat-doodles";
import { type PostItem, type CategoryItem, getPostTags } from "@/lib/client-api";
import { formatDateDash } from "@/lib/format";

export function HomeView({
  initialData,
}: {
  initialData?: {
    posts?: PostItem[];
    totalPosts?: number;
    categories?: CategoryItem[];
  };
}) {
  const posts = initialData?.posts?.slice(0, 4) ?? [];
  const categories = initialData?.categories ?? [];
  const totalPosts = initialData?.totalPosts ?? 0;

  const displayCategories = categories.slice(0, 5).map((c, i) => ({
    name: c.name,
    slug: c.slug,
    description: c.description || "分类文章集合",
    count: c.postCount || 0,
    iconKey: c.icon || ["dev", "bulb", "design", "tool", "plane"][i % 5],
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="page-container flex-1 py-8 sm:py-10 space-y-10 animate-tab-fade">
        {/* Hero — illustration blends into page (no card frame) */}
        <section className="relative flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-6 pt-2">
          {/* Left doodles */}
          <span className="pointer-events-none absolute left-0 top-6 hidden lg:block text-[#F9D490]" aria-hidden>
            <OutlineStar className="w-7 h-7 rotate-12" />
          </span>
          <span className="pointer-events-none absolute left-10 top-28 hidden lg:block text-[#E65A00]/40" aria-hidden>
            <svg width="18" height="28" viewBox="0 0 18 28" fill="none">
              <path d="M4 2 L10 8 M2 12 L12 14 M6 22 L14 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="pointer-events-none absolute left-0 bottom-8 hidden lg:block text-[#8FA88E]" aria-hidden>
            <svg width="48" height="36" viewBox="0 0 48 36" fill="none">
              <path d="M4 28 C10 10, 22 8, 30 18 C36 26, 42 20, 44 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>

          <div className="flex-1 space-y-5 text-left relative z-10 max-w-xl">
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black font-serif text-[#1A1A1A] tracking-tight leading-[1.15]">
              你好，我是{" "}
              <span className="relative inline-block font-serif">
                Leon
                <span className="absolute left-0 right-0 -bottom-1 flex justify-center pointer-events-none">
                  <TitleBrushUnderline className="w-full h-2.5 text-[#E65A00]" />
                </span>
              </span>
              。
            </h1>
            <p className="text-base sm:text-lg text-[#6B655C] font-normal max-w-md">
              一名热爱开发、设计与分享的独立开发者。
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm text-[#3A332C]">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>🧡</span> 写有温度的代码
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>🍃</span> 做有价值的产品
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>⭐</span> 分享真实的思考
              </span>
            </div>
          </div>

          <div className="w-full lg:w-[52%] flex justify-center lg:justify-end relative">
            <CatHero className="w-full max-w-[640px]" />
          </div>
        </section>

        {/* Categories (left) + Evidence (right, spans both rows) + Latest posts */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7 items-start">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-6">
            {/* 主要分类 — one parent card containing title + 5 tiles */}
            <div className="paper-card p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-[#E65A00] rounded-full" />
                  <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A1A1A]">
                    主要分类
                  </h2>
                </div>
                <Link
                  href="/categories"
                  className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-1"
                >
                  <span>查看全部</span>
                  <span>→</span>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {displayCategories.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/categories/${c.slug}`}
                    className="rounded-2xl border border-[#EDE3D4] bg-[#FFFEFB] p-3 sm:p-4 flex flex-col items-center text-center hover:border-[#E65A00] hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="h-14 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <CategoryIllustratedIcon iconKey={c.iconKey} className="w-20 h-14" />
                    </div>
                    <h3 className="text-sm font-bold text-[#1A1A1A] mb-0.5 group-hover:text-[#E65A00] transition-colors">
                      {c.name}
                    </h3>
                    <span className="text-[11px] text-[#8C8375]">
                      {c.count} 篇文章
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* 最新文章 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-[#E65A00] rounded-full" />
                  <h2 className="text-lg sm:text-xl font-bold font-serif text-[#1A1A1A]">
                    最新文章
                  </h2>
                </div>
                <Link
                  href="/posts"
                  className="text-xs sm:text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-1"
                >
                  <span>查看全部文章</span>
                  <span>→</span>
                </Link>
              </div>

              <div className="paper-card divide-y divide-[#F0E6D8] p-2 sm:p-3">
                {posts.map((post, idx) => (
                  <article
                    key={post.slug || post.id || idx}
                    className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#FFFDF9] transition-colors rounded-xl group"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="hidden sm:flex shrink-0 items-center justify-center w-16 h-12">
                        <HomePostRowIcon index={idx} className="w-16 h-12" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <Link href={`/posts/${post.slug}`}>
                          <h3 className="text-base font-bold text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors leading-snug">
                            {post.title}
                          </h3>
                        </Link>
                        <p className="text-xs sm:text-sm text-[#6B655C] line-clamp-2">
                          {post.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-2 min-w-0 max-w-full sm:w-36 sm:max-w-36 shrink-0 self-end sm:self-center">
                      <span className="text-xs text-[#8C8375] font-mono">
                        {formatDateDash(post.publishedAt)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {post.category && (
                          <CategoryBadge name={post.category.name} href={`/categories/${post.category.slug}`} className="max-w-full whitespace-normal [overflow-wrap:anywhere]" />
                        )}
                        {getPostTags(post).slice(0, 1).map((tag) => (
                          <TagBadge
                            key={tag.slug}
                            name={tag.name}
                            href={`/tags/${tag.slug}`}
                            size="sm"
                          />
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {/* Right: 作品证据 */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="paper-card p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold font-serif text-[#1A1A1A]">作品证据</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] whitespace-nowrap">
                  <span aria-hidden>⭐</span> 持续构建中
                </span>
              </div>

              <div className="flex items-center justify-center select-none py-1">
                <ProjectEvidenceWindow className="w-60 h-auto" />
              </div>

              <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed">
                独立开发者的作品集合，持续迭代中，关注解决实际问题，创造长期价值。
              </p>

              <div className="space-y-3.5 pt-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FFF5EE] flex items-center justify-center text-[#E65A00] shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-extrabold text-xl text-[#1A1A1A]">{totalPosts}</span>
                    <span className="text-xs text-[#6B655C]">已发布文章</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#EBF4EC] flex items-center justify-center text-[#2E7D32] shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-extrabold text-xl text-[#1A1A1A]">{categories.length}</span>
                    <span className="text-xs text-[#6B655C]">内容分类</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#D9A821] shrink-0">
                    <SparkleStar className="w-4 h-4 text-[#D9A821]" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-extrabold text-xl text-[#1A1A1A]">持续</span>
                    <span className="text-xs text-[#6B655C]">内容更新</span>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <Button href="/posts" size="lg" className="w-full">
                  <span>查看全部文章</span>
                  <span className="ml-1">→</span>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
