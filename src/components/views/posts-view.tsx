"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "../ui/header";
import { Footer } from "../ui/footer";
import { TagBadge, CategoryBadge } from "../ui/badge";
import { CustomSelect, SelectOption } from "../ui/select";
import { PawIcon, WavyDivider, CatSleep, CatPeekSidebar } from "../ui/cat-doodles";
import { clientApi, PostItem, CategoryItem, TagItem, getPostTags } from "@/lib/client-api";

// Fallback posts matching redesign-posts-desktop.png
const DEFAULT_POSTS: PostItem[] = [
  {
    id: "1",
    slug: "implementing-a-high-performance-memory-pool-from-scratch",
    title: "从零实现一个高性能的内存池",
    excerpt: "深入剖析内存池的设计与实现，手写一个高性能内存池，支持多线程场景...",
    status: "PUBLISHED",
    publishedAt: "2024-05-20",
    category: { id: "c1", name: "后端开发", slug: "backend" },
    postTags: [
      { tag: { id: "t1", name: "C++", slug: "cpp" } },
      { tag: { id: "t2", name: "内存管理", slug: "memory" } },
      { tag: { id: "t3", name: "性能优化", slug: "perf" } },
      { tag: { id: "t4", name: "多线程", slug: "threading" } },
    ],
  },
  {
    id: "2",
    slug: "deep-dive-browser-rendering-pipeline",
    title: "深入理解浏览器渲染原理",
    excerpt: "从 HTML 解析到像素绘制，带你一步步理解浏览器如何把页面呈现出来...",
    status: "PUBLISHED",
    publishedAt: "2024-05-12",
    category: { id: "c2", name: "前端开发", slug: "frontend" },
    postTags: [
      { tag: { id: "t5", name: "浏览器", slug: "browser" } },
      { tag: { id: "t6", name: "渲染流程", slug: "rendering" } },
      { tag: { id: "t3", name: "性能优化", slug: "perf" } },
      { tag: { id: "t7", name: "前端基础", slug: "fe-basics" } },
    ],
  },
  {
    id: "3",
    slug: "mysql-index-underlying-principles-explained",
    title: "MySQL 索引底层原理解析",
    excerpt: "从 B+Tree 到索引优化，全面解析 MySQL 索引的实现原理与最佳实践...",
    status: "PUBLISHED",
    publishedAt: "2024-05-05",
    category: { id: "c3", name: "数据库", slug: "database" },
    postTags: [
      { tag: { id: "t8", name: "MySQL", slug: "mysql" } },
      { tag: { id: "t9", name: "索引", slug: "index" } },
      { tag: { id: "t10", name: "B+Tree", slug: "btree" } },
      { tag: { id: "t3", name: "性能优化", slug: "perf" } },
    ],
  },
  {
    id: "4",
    slug: "how-to-design-an-extensible-logging-system",
    title: "如何设计一个可扩展的日志系统",
    excerpt: "从需求分析到架构设计，分享我在日志系统设计中的思考与踩坑经验...",
    status: "PUBLISHED",
    publishedAt: "2024-04-28",
    category: { id: "c4", name: "工程实践", slug: "engineering" },
    postTags: [
      { tag: { id: "t11", name: "架构设计", slug: "architecture" } },
      { tag: { id: "t12", name: "日志系统", slug: "logging" } },
      { tag: { id: "t13", name: "可扩展性", slug: "extensibility" } },
      { tag: { id: "t4", name: "工程实践", slug: "engineering" } },
    ],
  },
  {
    id: "5",
    slug: "how-programmers-can-efficiently-learn-new-tech",
    title: "程序员如何高效学习新技术",
    excerpt: "分享我的学习方法和效率工具清单，帮助你更快掌握新技术，少走弯路...",
    status: "PUBLISHED",
    publishedAt: "2024-04-20",
    category: { id: "c5", name: "开发随笔", slug: "dev-essay" },
    postTags: [
      { tag: { id: "t14", name: "学习方法", slug: "learning" } },
      { tag: { id: "t15", name: "效率工具", slug: "productivity" } },
      { tag: { id: "t16", name: "成长记录", slug: "growth" } },
      { tag: { id: "t17", name: "思维方式", slug: "mindset" } },
    ],
  },
];

const DEFAULT_POPULAR_TAGS = [
  { name: "后端开发", count: 28, slug: "backend" },
  { name: "性能优化", count: 24, slug: "perf" },
  { name: "C++", count: 20, slug: "cpp" },
  { name: "系统设计", count: 18, slug: "system-design" },
  { name: "MySQL", count: 16, slug: "mysql" },
  { name: "数据库", count: 15, slug: "database" },
  { name: "架构设计", count: 14, slug: "architecture" },
  { name: "Linux", count: 13, slug: "linux" },
  { name: "计算机基础", count: 12, slug: "cs-basics" },
  { name: "算法", count: 11, slug: "algorithm" },
  { name: "前端开发", count: 10, slug: "frontend" },
  { name: "工程实践", count: 10, slug: "engineering" },
  { name: "多线程", count: 9, slug: "threading" },
  { name: "Redis", count: 9, slug: "redis" },
  { name: "网络编程", count: 8, slug: "networking" },
  { name: "Git", count: 8, slug: "git" },
  { name: "学习方法", count: 7, slug: "learning" },
];

export function PostsView({
  initialData,
}: {
  initialData?: {
    posts?: PostItem[];
    categories?: CategoryItem[];
    tags?: TagItem[];
  };
}) {
  const [posts, setPosts] = useState<PostItem[]>(() =>
    initialData?.posts && initialData.posts.length > 0 ? initialData.posts : DEFAULT_POSTS
  );
  const [categories, setCategories] = useState<CategoryItem[]>(() => initialData?.categories ?? []);
  const [tags, setTags] = useState<TagItem[]>(() => initialData?.tags ?? []);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"latest" | "popular">("latest");
  const [keyword, setKeyword] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    clientApi.getPosts({ pageSize: 50 }).then((res) => {
      if (res.data && res.data.length > 0) setPosts(res.data);
    });
    clientApi.getCategories().then((res) => {
      if (res.data && res.data.length > 0) setCategories(res.data);
    });
    clientApi.getTags().then((res) => {
      if (res.data && res.data.length > 0) setTags(res.data);
    });
  }, []);

  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
    }, 280);
  };

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
    }, 240);
  };

  const handleTagChange = (val: string) => {
    setSelectedTag(val);
    setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
    }, 240);
  };

  // Filtered and sorted posts. "最受欢迎" uses tag count as the popularity
  // proxy (the data model has no view/like counters), newest first as tiebreak.
  const filteredPosts = useMemo(() => {
    const time = (p: PostItem) =>
      new Date(p.publishedAt || p.createdAt || 0).getTime();
    const list = posts.filter((post) => {
      if (selectedCategory !== "ALL" && post.category?.slug !== selectedCategory) {
        return false;
      }
      if (selectedTag !== "ALL" && !post.postTags?.some((pt) => pt.tag.slug === selectedTag)) {
        return false;
      }
      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const matchTitle = post.title.toLowerCase().includes(q);
        const matchExcerpt = post.excerpt.toLowerCase().includes(q);
        if (!matchTitle && !matchExcerpt) return false;
      }
      return true;
    });
    if (sortBy === "popular") {
      list.sort((a, b) => {
        const tagsA = getPostTags(a).length;
        const tagsB = getPostTags(b).length;
        if (tagsA !== tagsB) return tagsB - tagsA;
        return time(b) - time(a);
      });
    } else {
      list.sort((a, b) => time(b) - time(a));
    }
    return list;
  }, [posts, selectedCategory, selectedTag, keyword, sortBy]);

  const displayTags = tags.length > 0
    ? tags.map((t) => ({ name: t.name, slug: t.slug, count: t.postCount || 0 }))
    : DEFAULT_POPULAR_TAGS;

  // Options for custom selects
  const categoryOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [{ value: "ALL", label: "所有分类" }];
    categories.forEach((c) => {
      list.push({ value: c.slug, label: c.name, count: c.postCount });
    });
    return list;
  }, [categories]);

  const tagOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [{ value: "ALL", label: "所有标签" }];
    tags.forEach((t) => {
      list.push({ value: t.slug, label: t.name, count: t.postCount });
    });
    return list;
  }, [tags]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePath="/posts" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10 animate-tab-fade">
        {/* Page Title */}
        <div className="flex items-center gap-3">
          <h1 className="page-title font-extrabold font-serif text-[#1A1A1A]">
            全部文章
          </h1>
          <div className="flex items-center text-[#E65A00] relative">
            <PawIcon className="w-8 h-8" />
            <svg className="absolute -top-2 -right-3 w-5 h-5 text-[#E65A00]" viewBox="0 0 20 20" fill="none">
              <path d="M4 16L2 18M10 12L12 8M16 14L19 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-5">
          {/* Custom Category Dropdown */}
          <CustomSelect
            value={selectedCategory}
            onChange={handleCategoryChange}
            options={categoryOptions}
            placeholder="所有分类"
          />

          <div className="inline-flex overflow-hidden rounded-full border border-[#bca98d] bg-white">
            <button
              type="button"
              onClick={() => setSortBy("latest")}
              aria-pressed={sortBy === "latest"}
              className={`min-h-11 px-5 text-sm font-semibold text-[#3a2e20] transition-colors cursor-pointer ${sortBy === "latest" ? "bg-[#F6D17B]" : "hover:bg-[#fff5ee]"}`}
            >
              最新发布
            </button>
            <button
              type="button"
              onClick={() => setSortBy("popular")}
              aria-pressed={sortBy === "popular"}
              className={`min-h-11 px-5 text-sm font-semibold text-[#3a2e20] transition-colors cursor-pointer ${sortBy === "popular" ? "bg-[#F6D17B]" : "hover:bg-[#fff5ee]"}`}
            >
              最受欢迎
            </button>
          </div>

          {/* Custom Tag Dropdown */}
          <CustomSelect
            value={selectedTag}
            onChange={handleTagChange}
            options={tagOptions}
            placeholder="所有标签"
            prefix="#"
          />

          {/* Search input with loading animation */}
          <div className="flex-1 min-w-[200px] relative">
            <input
              type="text"
              value={keyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
              placeholder="搜索文章标题或内容..."
              className="w-full pl-4 pr-10 py-2 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none shadow-xs transition-colors"
            />
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
                onClick={() => setKeyword("")}
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
          </div>
        </div>

        {/* Content Layout: Posts List (Left 8) + Sidebar (Right 4) with stable column widths */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Post items list with min-height to prevent layout jump */}
          <div className="lg:col-span-8 w-full min-h-[480px]">
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
            ) : filteredPosts.length > 0 ? (
              <div className="space-y-6">
                {filteredPosts.map((post, idx) => (
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
                            <span>{post.publishedAt ? post.publishedAt.slice(0, 10) : "—"}</span>
                          </div>
                          {post.category && (
                            <CategoryBadge name={post.category.name} href={`/categories/${post.category.slug}`} />
                          )}
                        </div>

                        {/* Title, Excerpt & Tags in Middle */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 sm:hidden text-xs text-[#8C8375] font-mono">
                            <span>{post.publishedAt ? post.publishedAt.slice(0, 10) : "—"}</span>
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

                    {/* Wavy Divider between items */}
                    {idx < filteredPosts.length - 1 && (
                      <div className="py-1">
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
                    setSelectedCategory("ALL");
                    setSelectedTag("ALL");
                    setKeyword("");
                  }}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-[#E65A00] hover:bg-[#FFF5EE] rounded-full border border-[#E65A00] transition-colors cursor-pointer mt-2"
                >
                  清空筛选条件
                </button>
              </div>
            )}
          </div>

          {/* Right Sidebar: Popular Tags with Peeking Cat */}
          <div className="lg:col-span-4 w-full">
            <aside className="paper-card-dashed p-6 space-y-6 relative overflow-hidden bg-white/70">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-serif text-[#1A1A1A]">
                  热门标签
                </h3>
                <span className="text-[#E65A00] text-sm">´</span>
              </div>

              {/* Tags Grid */}
              <div className="grid grid-cols-2 gap-2">
                {displayTags.map((tag) => (
                  <TagBadge
                    key={tag.slug}
                    name={tag.name}
                    count={tag.count}
                    href={`/tags/${tag.slug}`}
                    size="sm"
                    className="justify-between w-full"
                  />
                ))}
              </div>

              {/* Bottom Peeking Cat and Plant */}
              <div className="pt-4 flex items-center justify-center border-t border-[#F0E6D8] select-none">
                <CatPeekSidebar className="w-64 h-auto" />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
