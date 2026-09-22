"use client";

import React from "react";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge } from "../ui/badge";
import { CatStretching, PawIcon } from "../ui/cat-doodles";
import type { TagItem } from "@/lib/client-api";

export function TagsView({
  initialData,
}: {
  initialData?: {
    tags?: TagItem[];
  };
}) {
  const tags = initialData?.tags ?? [];

  const displayTags = tags.map((t) => ({ name: t.name, slug: t.slug, count: t.postCount || 0 }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/tags" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-12 relative animate-tab-fade">
        {/* Page Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="page-title font-extrabold font-serif text-[#1A1A1A]">
              标签
            </h1>
            <div className="flex items-center text-[#E65A00] relative">
              <PawIcon className="w-8 h-8" />
              <svg className="absolute -top-2 -right-3 w-5 h-5 text-[#E65A00]" viewBox="0 0 20 20" fill="none">
                <path d="M4 16L2 18M10 12L12 8M16 14L19 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <p className="text-sm sm:text-base text-[#6B655C]">
            按标签发现相关文章
          </p>
        </div>

        {/* Tag Cloud Pills Grid */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 max-w-4xl">
          {displayTags.map((tag) => (
            <TagBadge
              key={tag.slug}
              name={tag.name}
              count={tag.count}
              href={`/tags/${tag.slug}`}
              size="lg"
              className="hover:scale-105"
            />
          ))}
          {displayTags.length === 0 && (
            <div className="w-full paper-card-dashed p-12 text-center text-sm text-[#8C8375]">
              暂无公开标签
            </div>
          )}
        </div>

        {/* Bottom Right Stretching Cat & Footprint Slogan */}
        <div className="pt-10 flex justify-end select-none">
          <CatStretching className="w-80 sm:w-[520px] md:w-[620px] h-auto" />
        </div>
      </main>

      <Footer />
    </div>
  );
}
