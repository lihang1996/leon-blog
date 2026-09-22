"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "../../ui/header";
import { StatusBadge } from "../../ui/badge";
import {
  CatDashboardWave,
  NotePencilIcon,
  FolderOutlineIcon,
  TagOutlineIcon,
  PottedPlant,
} from "../../ui/cat-doodles";
import { clientApi, type AdminPostItem, type AdminCategoryItem, type AdminTagItem } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

export function AdminDashboardView() {
  const [posts, setPosts] = useState<AdminPostItem[]>([]);
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [tags, setTags] = useState<AdminTagItem[]>([]);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      clientApi.getAdminPosts({ pageSize: 5 }).then((res) => {
        if (res.data) {
          setPosts(res.data);
          if (res.meta) setTotalPosts(res.meta.total);
          else setTotalPosts(res.data.length);
        }
      }),
      clientApi.getAdminCategories().then((res) => {
        if (res.data) setCategories(res.data);
      }),
      clientApi.getAdminTags().then((res) => {
        if (res.data) setTags(res.data);
      }),
    ]).finally(() => {
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header admin activePath="/admin" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-8 animate-tab-fade pb-28">
        {/* Title row: 概览 + waving cat | 新建文章 — matching redesign-admin-dashboard-desktop.png */}
        <div className="flex items-center justify-between gap-6 pb-1">
          <div className="flex items-center gap-3">
            <h1 className="admin-title font-extrabold font-serif text-[#1A1A1A] tracking-tight">概览</h1>
            <CatDashboardWave className="w-28 sm:w-36 h-auto" />
          </div>
          <Link
            href="/admin/posts/new"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#E65A00] px-7 text-sm font-bold text-white transition-colors hover:bg-[#C24E00]"
          >
            + 新建文章
          </Link>
        </div>

        {/* 3 Stat Cards: dark outline doodle icons, icon + number side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Link
            href="/admin/posts"
            className="paper-card p-6 flex items-center gap-5 hover:border-[#E65A00] transition-colors group"
          >
            <NotePencilIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />
            <div>
              <div className="text-4xl font-extrabold font-serif text-[#1A1A1A] leading-none">
                {loading ? "-" : (totalPosts ?? posts.length)}
              </div>
              <div className="text-sm text-[#6B655C] mt-1">文章总数</div>
            </div>
          </Link>

          <Link
            href="/admin/categories"
            className="paper-card p-6 flex items-center gap-5 hover:border-[#E65A00] transition-colors group"
          >
            <FolderOutlineIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />
            <div>
              <div className="text-4xl font-extrabold font-serif text-[#1A1A1A] leading-none">
                {loading ? "-" : categories.length}
              </div>
              <div className="text-sm text-[#6B655C] mt-1">分类总数</div>
            </div>
          </Link>

          <Link
            href="/admin/tags"
            className="paper-card p-6 flex items-center gap-5 hover:border-[#E65A00] transition-colors group"
          >
            <TagOutlineIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />
            <div>
              <div className="text-4xl font-extrabold font-serif text-[#1A1A1A] leading-none">
                {loading ? "-" : tags.length}
              </div>
              <div className="text-sm text-[#6B655C] mt-1">标签总数</div>
            </div>
          </Link>
        </div>

        {/* Recent updates card: title lives INSIDE the card per mockup */}
        <section className="paper-card p-6 sm:p-8 space-y-5">
          <h2 className="text-xl sm:text-2xl font-extrabold font-serif text-[#1A1A1A]">
            最近更新
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#F0E6D8] text-[#8C8375]">
                  <th className="pb-3 font-semibold w-5/12">文章标题</th>
                  <th className="pb-3 font-semibold w-2/12">分类</th>
                  <th className="pb-3 font-semibold text-center w-2/12">状态</th>
                  <th className="pb-3 font-semibold w-2/12">更新时间</th>
                  <th className="pb-3 font-semibold text-right w-1/12">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF2E8]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#8C8375]">
                      加载中...
                    </td>
                  </tr>
                ) : posts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#8C8375]">
                      暂无文章，点击右上角新建第一篇！
                    </td>
                  </tr>
                ) : (
                  posts.slice(0, 5).map((p) => (
                    <tr key={p.id} className="hover:bg-[#FFFDF9] transition-colors group">
                      <td className="py-4 font-semibold text-[#1A1A1A] pr-4">
                        <Link
                          href={`/admin/posts/${p.id}/edit`}
                          className="hover:text-[#E65A00] transition-colors line-clamp-1"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="py-4 text-[#6B655C]">
                        {p.category?.name || "未分类"}
                      </td>
                      <td className="py-4 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-4 text-[#8C8375] font-mono text-xs">
                        {formatDateTime(p.updatedAt || p.createdAt)}
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end gap-3 text-xs font-bold">
                          <Link
                            href={`/admin/posts/${p.id}/edit`}
                            className="text-[#E65A00] hover:underline"
                          >
                            编辑
                          </Link>
                          <Link
                            href={
                              p.status === "PUBLISHED" && p.slug
                                ? `/posts/${p.slug}`
                                : `/admin/posts/${p.id}/preview`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#6B655C] hover:text-[#E65A00] hover:underline"
                          >
                            查看
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-1 text-center">
            <Link
              href="/admin/posts"
              className="inline-flex items-center gap-1 text-sm font-bold text-[#E65A00] hover:underline"
            >
              查看全部文章 <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        {/* Bottom-left plant decoration per mockup */}
        <div className="pt-2 select-none pointer-events-none">
          <PottedPlant className="w-14 sm:w-16 h-auto" />
        </div>
      </main>

      {/* Bottom-right FAB per mockup */}
      <Link
        href="/admin/posts/new"
        aria-label="新建文章"
        className="fixed bottom-8 right-8 z-30 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[#E65A00] text-3xl sm:text-4xl leading-none text-white shadow-lg shadow-[#E65A00]/25 transition-transform hover:scale-105"
      >
        +
      </Link>
    </div>
  );
}
