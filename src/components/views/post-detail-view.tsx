"use client";

import React from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge } from "../ui/badge";
import {
  CatLoungingBanner,
  PinnedNote,
  HangingFrame,
  PottedPlant,
  BackToTopButton,
  PawIcon,
} from "../ui/cat-doodles";
import { MarkdownContent } from "../ui/markdown-content";
import { NotFoundView } from "./not-found-view";
import { type PostItem, getPostTags } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

export function PostDetailView({
  slug,
  initialData,
}: {
  slug: string;
  initialData?: {
    postDetail?: PostItem;
    nextPost?: PostItem;
  };
}) {
  const p = initialData?.postDetail;
  const nextPost = initialData?.nextPost;
  if (!p || p.slug !== slug) return <NotFoundView />;

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header activePath="/posts" />

      <main className="page-container flex-1 py-8 relative animate-tab-fade">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-[#8C8375] mb-6">
          <Link href="/" className="hover:text-[#E65A00] transition-colors">
            首页
          </Link>
          <span>&gt;</span>
          {p.category ? (
            <Link
              href={`/categories/${p.category.slug}`}
              className="hover:text-[#E65A00] transition-colors"
            >
              {p.category.name}
            </Link>
          ) : (
            <span>全部文章</span>
          )}
          <span>&gt;</span>
          <span className="text-[#3A332C] truncate max-w-xs font-medium">
            {p.title}
          </span>
        </nav>

        {/* Central Article Container */}
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            {/* Paw print above title, matching redesign-post-detail-desktop.png */}
            <div className="flex justify-center">
              <PawIcon className="w-9 h-9 text-[#E65A00]" />
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-serif text-[#1A1A1A] leading-tight">
              {p.title}
            </h1>

            {/* Meta Line */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm text-[#8C8375]">
              {/* Category: outlined orange pill per mockup */}
              {p.category && (
                <Link
                  href={`/categories/${p.category.slug}`}
                  className="inline-flex items-center px-3 py-1 rounded-full border border-[#E65A00] text-[#E65A00] text-xs font-semibold hover:bg-[#FFF5EE] transition-colors"
                >
                  {p.category.name}
                </Link>
              )}

              {/* Date */}
              <div className="flex items-center gap-1 font-mono">
                <svg className="w-4 h-4 text-[#E65A00]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{formatDate(p.publishedAt)}</span>
              </div>

              {/* Reading time */}
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-[#8C8375]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>{Math.max(1, Math.round((p.contentMd?.length ?? 600) / 500))} min</span>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5">
                {getPostTags(p).map((tag) => (
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

          {p.coverImageUrl && (
            <img
              src={p.coverImageUrl}
              alt={`${p.title} 封面`}
              className="max-h-[34rem] w-full rounded-3xl border border-[#EEDFC9] object-cover shadow-sm"
            />
          )}

          {/* Stretching Cat Banner Illustration */}
          <div className="flex justify-center py-2 select-none">
            <CatLoungingBanner className="w-full max-w-2xl h-auto" />
          </div>

          {/* Article body sits directly on the paper, no white card */}
          <article className="post-prose text-base sm:text-lg">
            <MarkdownContent content={p.contentMd ?? ""} />
          </article>

          {/* Next Post dashed card, matching redesign-post-detail-desktop.png */}
          {nextPost && (
            <Link
              href={`/posts/${nextPost.slug}`}
              className="paper-card-dashed p-5 sm:p-6 flex items-center gap-4 group hover:border-[#E65A00] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#FFF5EE] border border-[#FFCCAA] flex items-center justify-center text-[#E65A00] shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#8C8375]">下一篇</div>
                <div className="text-base sm:text-lg font-bold font-serif text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors truncate">
                  {nextPost.title}
                </div>
              </div>
              <span className="text-[#E65A00] text-lg font-bold transition-transform group-hover:translate-x-1">→</span>
            </Link>
          )}
        </div>

        {/* Desktop Floating Decorations (Left Side) */}
        <aside className="hidden xl:block absolute left-8 top-40 space-y-12 w-48 select-none pointer-events-none">
          {/* Pinned Sticky Note */}
          <div className="select-none">
            <PinnedNote className="w-36 h-auto" />
          </div>

          {/* Heart Doodle */}
          <div className="text-[#E65A00] opacity-80 pl-8">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>

          {/* Potted Plant */}
          <div className="pl-4">
            <PottedPlant className="w-20 h-28" />
          </div>
        </aside>

        {/* Desktop Floating Decorations (Right Side) */}
        <aside className="hidden xl:block absolute right-8 top-32 space-y-10 w-48 select-none pointer-events-none">
          {/* Hanging Cat Photo Frame */}
          <div className="select-none pl-4">
            <HangingFrame className="w-32 h-auto" />
          </div>

          {/* Paper Plane Doodle */}
          <div className="relative pl-6">
            <svg className="w-16 h-12" viewBox="0 0 50 40" fill="none">
              <path d="M4 35C12 30 20 28 24 18" stroke="#D5C7B2" strokeWidth="1.4" strokeDasharray="3 3" />
              <path d="M24 18L46 4L32 36L26 24L24 18Z" fill="#FFFDF8" stroke="#4A2B11" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Handwritten slogan */}
          <div className="transform -rotate-6 space-y-1">
            <p className="font-serif italic text-base font-bold text-[#E65A00] leading-tight">
              专注当下，<br />代码会说话。
            </p>
            <svg className="w-24 h-2 text-[#E65A00]" viewBox="0 0 60 6" fill="none">
              <path d="M2 3C18 1 42 5 58 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </aside>

        {/* Back To Top FAB */}
        <BackToTopButton />
      </main>

      <Footer />
    </div>
  );
}
