"use client";

import React from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { CategoryIllustratedIcon, CatSittingPlant, PawIcon } from "../ui/cat-doodles";
import type { CategoryItem } from "@/lib/client-api";

export function CategoriesView({
  initialData,
}: {
  initialData?: {
    categories?: CategoryItem[];
  };
}) {
  const iconKeys = ["dev", "bulb", "design", "tool", "plane", "coffee", "heart", "leaf"];
  const categories = (initialData?.categories ?? []).map((category, index) => ({
    ...category,
    iconKey: category.icon || iconKeys[index % iconKeys.length],
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/categories" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-12 relative animate-tab-fade">
        {/* Decorative Doodles on Top */}
        <div className="absolute top-8 right-12 text-[#E65A00] opacity-80 hidden md:block select-none pointer-events-none">
          <svg className="w-24 h-8" viewBox="0 0 80 20" fill="none">
            <path d="M2 15C15 2 30 18 45 6C60 -2 70 12 78 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* Page Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="page-title font-extrabold font-serif text-[#1A1A1A]">
              分类
            </h1>
            <div className="flex items-center text-[#E65A00] relative">
              <PawIcon className="w-8 h-8" />
              <svg className="absolute -top-2 -right-3 w-5 h-5 text-[#E65A00]" viewBox="0 0 20 20" fill="none">
                <path d="M4 16L2 18M10 12L12 8M16 14L19 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <p className="text-sm sm:text-base text-[#6B655C]">
            按主题浏览全部文章
          </p>
        </div>

        {/* 3-Column Category Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/categories/${c.slug}`}
              className="paper-card p-6 sm:p-8 flex flex-col items-center text-center hover:border-[#E65A00] hover:-translate-y-1 transition-all group relative overflow-hidden"
            >
              {/* Category Illustrated Icon */}
              <div className="h-20 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform select-none">
                <CategoryIllustratedIcon iconKey={c.iconKey || "dev"} className="w-24 h-16" />
              </div>

              {/* Name */}
              <h2 className="text-xl font-bold font-serif text-[#1A1A1A] mb-2 group-hover:text-[#E65A00] transition-colors">
                {c.name}
              </h2>

              {/* Description */}
              <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed mb-4 line-clamp-2">
                {c.description || "浏览该分类下的所有精选文章"}
              </p>

              {/* Post Count */}
              <span className="text-xs font-semibold text-[#8C8375] mt-auto">
                {c.postCount || 0} 篇文章
              </span>
            </Link>
          ))}
          {categories.length === 0 && (
            <div className="sm:col-span-2 lg:col-span-3 paper-card-dashed p-12 text-center text-sm text-[#8C8375]">
              暂无公开分类
            </div>
          )}
        </div>

        {/* Bottom Sitting Cat Illustration */}
        <div className="flex justify-end pt-4 pr-2 select-none">
          <CatSittingPlant className="w-48 sm:w-56 h-auto" />
        </div>
      </main>

      <Footer />
    </div>
  );
}
