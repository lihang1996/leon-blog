"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { Button } from "../ui/button";
import { CategoryBadge, TagBadge } from "../ui/badge";
import {
  CatHero,
  CategoryIllustratedIcon,
  SparkleStar,
  ProjectEvidenceWindow,
} from "../ui/cat-doodles";
import { clientApi, PostItem, CategoryItem, getPostTags } from "@/lib/client-api";

// Fallback sample data matching redesign-home-desktop.png
const DEFAULT_CATEGORIES: { name: string; slug: string; description: string; count: number; iconKey: string }[] = [
  { name: "开发笔记", slug: "dev-notes", description: "从需求分析、技术选型到功能实现，完整记录我的博客系统搭建过程。", count: 32, iconKey: "dev" },
  { name: "产品思考", slug: "product-thinking", description: "聊聊我对产品价值的理解，以及如何发现和定义真正的用户需求。", count: 18, iconKey: "bulb" },
  { name: "设计记录", slug: "design-log", description: "从视觉呼吸感出发，探讨留白在界面设计中的重要性与应用技巧。", count: 14, iconKey: "design" },
  { name: "工具推荐", slug: "tool-recommendations", description: "分享我日常开发中经常使用的命令行工具，让效率翻倍。", count: 11, iconKey: "tool" },
  { name: "生活随笔", slug: "life-essays", description: "记录生活点滴与日常思考。", count: 9, iconKey: "plane" },
];

const DEFAULT_POSTS: PostItem[] = [
  {
    id: "1",
    slug: "how-i-built-my-blog-system-from-0-to-1",
    title: "我如何从 0 到 1 搭建了自己的博客系统",
    excerpt: "从需求分析、技术选型到功能实现，完整记录我的博客系统搭建过程。",
    status: "PUBLISHED",
    publishedAt: "2024-05-20",
    category: { id: "c1", name: "开发笔记", slug: "dev-notes" },
    postTags: [{ tag: { id: "t1", name: "独立开发", slug: "indie-dev" } }],
  },
  {
    id: "2",
    slug: "product-thinking-solve-problems-not-create-demand",
    title: "产品沉思录：好的产品是解决问题，而非制造需求",
    excerpt: "聊聊我对产品价值的理解，以及如何发现和定义真正的用户需求。",
    status: "PUBLISHED",
    publishedAt: "2024-05-15",
    category: { id: "c2", name: "产品思考", slug: "product-thinking" },
    postTags: [{ tag: { id: "t2", name: "思考", slug: "thinking" } }],
  },
  {
    id: "3",
    slug: "whitespace-and-rhythm-in-ui-design",
    title: "UI 设计中的留白与节奏",
    excerpt: "从视觉呼吸感出发，探讨留白在界面设计中的重要性与应用技巧。",
    status: "PUBLISHED",
    publishedAt: "2024-05-08",
    category: { id: "c3", name: "设计记录", slug: "design-log" },
    postTags: [{ tag: { id: "t3", name: "UI/UX", slug: "ui-ux" } }],
  },
  {
    id: "4",
    slug: "10-cli-tools-to-boost-dev-productivity",
    title: "10 个提升开发效率的命令行工具",
    excerpt: "分享我日常开发中经常使用的命令行工具，让效率翻倍。",
    status: "PUBLISHED",
    publishedAt: "2024-04-28",
    category: { id: "c4", name: "工具推荐", slug: "tool-recommendations" },
    postTags: [{ tag: { id: "t4", name: "效率工具", slug: "productivity" } }],
  },
];

function PostRowIcon({ index }: { index: number }) {
  const iconKeys = ["dev", "bulb", "design", "tool"];
  return <CategoryIllustratedIcon iconKey={iconKeys[index % iconKeys.length]} className="w-20 h-14" />;
}

export function HomeView({
  initialData,
}: {
  initialData?: {
    posts?: PostItem[];
    categories?: CategoryItem[];
  };
}) {
  const [posts, setPosts] = useState<PostItem[]>(() =>
    initialData?.posts && initialData.posts.length > 0 ? initialData.posts.slice(0, 4) : DEFAULT_POSTS
  );
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    initialData?.categories && initialData.categories.length > 0 ? initialData.categories : []
  );

  useEffect(() => {
    clientApi.getPosts({ pageSize: 4 }).then((res) => {
      if (res.data && res.data.length > 0) {
        setPosts(res.data);
      }
    });
    clientApi.getCategories().then((res) => {
      if (res.data && res.data.length > 0) {
        setCategories(res.data);
      }
    });
  }, []);

  // Use dynamic categories or match design defaults
  const displayCategories = categories.length > 0
    ? categories.slice(0, 5).map((c, i) => ({
        name: c.name,
        slug: c.slug,
        description: c.description || "分类文章集合",
        count: c.postCount || 0,
        iconKey: c.icon || ["dev", "bulb", "design", "tool", "plane"][i % 5],
      }))
    : DEFAULT_CATEGORIES;

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-12 animate-tab-fade">
        {/* Hero Section */}
        <section className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-12 pt-4">
          <div className="flex-1 space-y-6 text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-serif text-[#1A1A1A] tracking-tight leading-tight">
              你好，我是 <span className="font-serif">Leon</span>。
            </h1>
            <p className="text-base sm:text-lg text-[#6B655C] font-normal max-w-lg">
              一名热爱开发、设计与分享的独立开发者。
            </p>

            {/* 3 Badges */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-white border border-[#E2D6C5] text-[#3A332C]">
                <span>🧡</span> 写有温度的代码
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-white border border-[#E2D6C5] text-[#3A332C]">
                <span>🍃</span> 做有价值的产品
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-white border border-[#E2D6C5] text-[#3A332C]">
                <span>⭐</span> 分享真实的思考
              </span>
            </div>
          </div>

          {/* Hero Cat & Workspace Illustration */}
          <div className="w-full lg:w-[680px] flex justify-center">
            <CatHero className="w-full max-w-[680px]" />
          </div>
        </section>

        {/* Major Categories Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 bg-[#E65A00] rounded-full" />
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-[#1A1A1A]">
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

          {/* Category Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {displayCategories.map((c) => (
              <Link
                key={c.slug}
                href={`/categories/${c.slug}`}
                className="paper-card p-5 flex flex-col items-center text-center hover:border-[#E65A00] hover:-translate-y-1 transition-all group"
              >
                <div className="h-16 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <CategoryIllustratedIcon iconKey={c.iconKey} className="w-24 h-16" />
                </div>
                <h3 className="text-base font-bold text-[#1A1A1A] mb-1 group-hover:text-[#E65A00] transition-colors">
                  {c.name}
                </h3>
                <span className="text-xs text-[#8C8375]">
                  {c.count} 篇文章
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Latest Posts & Proof / Sidebar Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Latest Posts (8 columns on lg) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 bg-[#E65A00] rounded-full" />
                <h2 className="text-xl sm:text-2xl font-bold font-serif text-[#1A1A1A]">
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

            {/* Post list card */}
            <div className="paper-card divide-y divide-[#F0E6D8] p-2 sm:p-4">
              {posts.map((post, idx) => (
                <article
                  key={post.slug || post.id || idx}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[#FFFDF9] transition-colors rounded-xl group"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="hidden sm:flex shrink-0 items-center justify-center w-12 h-12 rounded-xl bg-[#FAF5EC] border border-[#E8DEC8]">
                      <PostRowIcon index={idx} />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Link href={`/posts/${post.slug}`}>
                        <h3 className="text-base sm:text-lg font-bold text-[#1A1A1A] group-hover:text-[#E65A00] transition-colors leading-snug">
                          {post.title}
                        </h3>
                      </Link>
                      <p className="text-xs sm:text-sm text-[#6B655C] line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </div>

                  {/* Date & Badges */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 self-end sm:self-center">
                    <span className="text-xs text-[#8C8375] font-mono">
                      {post.publishedAt ? post.publishedAt.slice(0, 10) : "最新"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {post.category && (
                        <CategoryBadge name={post.category.name} href={`/categories/${post.category.slug}`} />
                      )}
                      {getPostTags(post).slice(0, 2).map((tag) => (
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

          {/* Right Sidebar: Evidence / Projects Card (4 columns on lg) */}
          <div className="lg:col-span-4">
            <div className="paper-card p-6 space-y-6 relative overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  作品证据
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  <span>⭐</span> 持续构建中
                </span>
              </div>

              {/* Hand-drawn browser mockup illustration */}
              <div className="flex items-center justify-center select-none py-1">
                <ProjectEvidenceWindow className="w-56 h-auto" />
              </div>

              <p className="text-xs sm:text-sm text-[#6B655C] leading-relaxed">
                独立开发者的作品集合，持续迭代中，关注解决实际问题，创造长期价值。
              </p>

              {/* Stats */}
              <div className="space-y-3.5 pt-2 border-t border-[#F0E6D8]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#FFF5EE] border border-[#FFCCAA] flex items-center justify-center text-[#E65A00]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-extrabold text-base text-[#1A1A1A]">12+</span>
                    <span className="text-xs text-[#6B655C] ml-2">独立项目</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#EBF4EC] border border-[#C8E6C9] flex items-center justify-center text-[#2E7D32]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-extrabold text-base text-[#1A1A1A]">8.3k</span>
                    <span className="text-xs text-[#6B655C] ml-2">累计用户</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#D9A821]">
                    <SparkleStar className="w-4 h-4 text-[#D9A821]" />
                  </div>
                  <div>
                    <span className="font-extrabold text-base text-[#1A1A1A]">400+</span>
                    <span className="text-xs text-[#6B655C] ml-2">GitHub Stars</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <Button href="/posts" size="lg" className="w-full">
                  <span>查看我的项目</span>
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
