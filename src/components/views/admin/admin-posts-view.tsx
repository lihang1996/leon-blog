"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { StatusBadge } from "../../ui/badge";
import { Modal } from "../../ui/modal";
import { CatPeek, PawIcon, SparkleStar, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, PostItem } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

export function AdminPostsView() {
  const [allPosts, setAllPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED">("ALL");
  const [sortBy, setSortBy] = useState<"latest" | "updated">("latest");
  const [deleteTarget, setDeleteTarget] = useState<PostItem | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    let active = true;
    void clientApi.getAdminPosts({ status: "ALL", pageSize: 100 }).then((res) => {
      if (!active) return;
      if (res.data) setAllPosts(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const total = allPosts.length;
    const drafts = allPosts.filter((p) => p.status === "DRAFT").length;
    const published = allPosts.filter((p) => p.status === "PUBLISHED").length;
    const archived = allPosts.filter((p) => p.status === "ARCHIVED").length;
    return { total, drafts, published, archived };
  }, [allPosts]);

  const displayedPosts = useMemo(() => {
    const list = activeTab === "ALL" ? allPosts : allPosts.filter((p) => p.status === activeTab);
    return [...list].sort((a, b) => {
      if (sortBy === "updated") {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      }
      const timeA = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [allPosts, activeTab, sortBy]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const res = await clientApi.deletePost(target.id);
    if (res.error) {
      setFeedback({ type: "error", msg: `删除失败：${res.error}` });
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    setAllPosts((prev) => prev.filter((p) => p.id !== target.id));
    setFeedback({ type: "success", msg: `已删除草稿「${target.title}」` });
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-[#FDFBF7]">
      <Header admin activePath="/admin/posts" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-12 animate-tab-fade">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs sm:text-sm font-semibold animate-fade-in ${
              feedback.type === "success"
                ? "bg-[#EBF4EC] text-[#2E7D32] border border-[#C8E6C9]"
                : "bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA]"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="relative inline-block">
              <div className="flex items-center gap-3">
                <h1 className="admin-title font-extrabold font-serif text-[#1A1A1A] tracking-tight">
                  文章管理
                </h1>
                <PawIcon className="w-6 h-6 text-[#E65A00]" />
              </div>
              <div className="absolute -bottom-2 left-0 w-24">
                <TitleBrushUnderline className="w-24 h-2 text-[#E65A00]" />
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#6B655C] pt-1">
              管理和发布您的博客文章
            </p>
          </div>

          <div>
            <Button href="/admin/posts/new" size="lg" className="shadow-md font-bold">
              <span>+ 新建文章</span>
            </Button>
          </div>
        </div>

        {/* Posts Table Card */}
        <div className="paper-card p-6 sm:p-8 space-y-6 relative mt-12">
          {/* Peeking Cat on top border matching mockup */}
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 select-none pointer-events-none">
            <CatPeek className="w-36 h-28" speech="写出精彩内容~" />
            <div className="absolute -top-2 -left-4 text-[#F9D490]">
              <SparkleStar className="w-5 h-5" />
            </div>
            <div className="absolute top-2 -right-4 text-[#E65A00]">
              <SparkleStar className="w-4 h-4" />
            </div>
          </div>

          {/* Filter Tabs & Sort Dropdown */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("ALL")}
                className={`px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors cursor-pointer ${
                  activeTab === "ALL"
                    ? "bg-[#E65A00] text-white shadow-xs"
                    : "text-[#6B655C] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]/60"
                }`}
              >
                全部 ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("DRAFT")}
                className={`px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors cursor-pointer ${
                  activeTab === "DRAFT"
                    ? "bg-[#E65A00] text-white shadow-xs"
                    : "text-[#6B655C] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]/60"
                }`}
              >
                草稿 ({counts.drafts})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("PUBLISHED")}
                className={`px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors cursor-pointer ${
                  activeTab === "PUBLISHED"
                    ? "bg-[#E65A00] text-white shadow-xs"
                    : "text-[#6B655C] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]/60"
                }`}
              >
                已发布 ({counts.published})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ARCHIVED")}
                className={`px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors cursor-pointer ${
                  activeTab === "ARCHIVED"
                    ? "bg-[#E65A00] text-white shadow-xs"
                    : "text-[#6B655C] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]/60"
                }`}
              >
                已归档 ({counts.archived})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "latest" | "updated")}
                aria-label="文章排序方式"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white border border-[#D5C7B2] text-[#3A332C] focus:outline-none cursor-pointer"
              >
                <option value="latest">最新发布</option>
                <option value="updated">最后更新</option>
              </select>
            </div>
          </div>

          {/* Posts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#F0E6D8] text-[#8C8375]">
                  <th className="pb-3 font-semibold pl-2">标题</th>
                  <th className="pb-3 font-semibold">状态</th>
                  <th className="pb-3 font-semibold">分类</th>
                  <th className="pb-3 font-semibold">发布时间</th>
                  <th className="pb-3 font-semibold text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF2E8]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-[#8C8375]">
                      加载中...
                    </td>
                  </tr>
                ) : displayedPosts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-[#8C8375]">
                      暂无对应文章
                    </td>
                  </tr>
                ) : (
                  displayedPosts.map((p) => (
                    <tr key={p.id} className="hover:bg-[#FFFDF9] transition-colors group">
                      <td className="py-4 font-semibold text-[#1A1A1A] max-w-sm truncate pl-2 pr-4">
                        <Link href={`/admin/posts/${p.id}/edit`} className="hover:text-[#E65A00] transition-colors">
                          {p.title}
                        </Link>
                      </td>
                      <td className="py-4">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-4 text-[#6B655C]">
                        {p.category?.name || "未分类"}
                      </td>
                      <td className="py-4 text-[#8C8375] font-mono text-xs">
                        {formatDateTime(p.publishedAt || p.createdAt)}
                      </td>
                      <td className="py-4 text-right pr-2 space-x-2">
                        <Link
                          href={
                            p.status === "PUBLISHED" && p.slug
                              ? `/posts/${p.slug}`
                              : `/admin/posts/${p.id}/preview`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-[#6B655C] hover:text-[#E65A00] hover:bg-[#FFF5EE] inline-block transition-colors"
                          title={p.status === "PUBLISHED" ? "查看文章" : "预览（未发布，仅后台可见）"}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Link>
                        <Link
                          href={`/admin/posts/${p.id}/edit`}
                          className="p-1.5 rounded-lg text-[#E65A00] hover:bg-[#FFF5EE] inline-block transition-colors"
                          title="编辑文章"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </Link>
                        {p.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="p-1.5 rounded-lg text-[#8C8375] hover:text-red-600 hover:bg-red-50 inline-block cursor-pointer transition-colors"
                            title="删除草稿"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title="确认删除文章？"
          description={`即将删除文章「${deleteTarget?.title}」。此操作不可撤销。`}
          confirmText="确认删除"
          isDanger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </main>
    </div>
  );
}
