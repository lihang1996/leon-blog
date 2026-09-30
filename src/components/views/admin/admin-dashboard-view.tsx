"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import { clientApi, isAuthFailure, type AdminPostItem, type AdminCategoryItem, type AdminTagItem } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

/**
 * FR-09: each resource (posts/categories/tags) carries its own read state —
 * loading / success / failure — so a single failed request can never render
 * the others as fake zeros, and a real zero only shows after a CONFIRMED
 * successful read. The post total comes from pagination metadata ONLY; when
 * the meta is missing the total is explicitly unknown, never "5" (the recent
 * list length).
 *
 * `hasData` records that a CONFIRMED successful read is still displayed. It
 * is carried across the loading phase of a retry: a network/server-class
 * failure then keeps the old values with a staleness marker (FR-09.5), while
 * any other failure hides them. Deriving "had data" from `phase ===
 * "success"` would break, because every retry first flips the phase to
 * loading (Codex review round 1).
 */
type ReadState = {
  phase: "loading" | "success" | "error";
  hasData: boolean;
  message?: string;
  /** Error while a confirmed-success value is still displayed (kept old data). */
  stale?: boolean;
};

const INITIAL_READ_STATE: ReadState = { phase: "loading", hasData: false };

function startReading(previous: ReadState): ReadState {
  return { phase: "loading", hasData: previous.hasData };
}

function isNetworkOrServerFailure(result: { status: number; errorCode?: string | null }): boolean {
  return result.status === 0 || result.status >= 500 || result.errorCode === "INVALID_RESPONSE";
}

function readErrorMessage(result: { error: string | null; status: number }): string {
  if (result.status === 0) return "网络连接失败，暂无法获取";
  return result.error || "读取失败，暂无法获取";
}

export function DashboardStatCard({
  label,
  href,
  icon,
  state,
  value,
  onRetry,
}: {
  label: string;
  href: string;
  icon: React.ReactNode;
  state: ReadState;
  value: number | null;
  onRetry: () => void;
}) {
  // First load (never had data) shows "—"; a non-stale failure shows
  // 暂无法获取; everything else — success, retry loading over old data,
  // stale-marked failure — shows the value itself ("—" when unknown).
  const display =
    state.phase === "loading" && !state.hasData ? "—"
    : state.phase === "error" && !state.stale ? "暂无法获取"
    : value === null ? "—"
    : value;
  return (
    <Link
      href={href}
      className="paper-card p-6 flex items-center gap-5 hover:border-[#E65A00] transition-colors group"
    >
      {icon}
      <div className="min-w-0">
        <div className="text-4xl font-extrabold font-serif text-[#1A1A1A] leading-none" aria-label={label}>
          {display}
        </div>
        <div className="text-sm text-[#6B655C] mt-1">{label}</div>
        {value === null && state.phase === "success" && (
          <div className="text-[11px] text-[#8C8375] mt-0.5">总数未知：响应缺少分页信息</div>
        )}
        {state.phase === "error" && state.stale && (
          <div className="text-[11px] text-[#E65A00] mt-0.5">数据可能不是最新（读取失败），显示上次成功值</div>
        )}
        {state.phase === "error" && !state.stale && (
          <div className="text-[11px] text-[#E65A00] mt-0.5">
            {state.message}
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRetry(); }}
              className="ml-1 underline font-semibold cursor-pointer"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}

export function AdminDashboardView() {
  const [posts, setPosts] = useState<AdminPostItem[]>([]);
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [tags, setTags] = useState<AdminTagItem[]>([]);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  // Per-resource independent read states (FR-09.1).
  const [postsState, setPostsState] = useState<ReadState>(INITIAL_READ_STATE);
  const [categoriesState, setCategoriesState] = useState<ReadState>(INITIAL_READ_STATE);
  const [tagsState, setTagsState] = useState<ReadState>(INITIAL_READ_STATE);
  // 身份/权限失效：必须遮蔽旧统计与文章行（FR-09.5），只留重新登录入口。
  const [authFailed, setAuthFailed] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setPostsState(startReading);
    const res = await clientApi.getAdminPosts({ pageSize: 5 });
    if (isAuthFailure(res)) {
      // Mask every previously loaded admin value — never render stale stats.
      setPosts([]);
      setCategories([]);
      setTags([]);
      setTotalPosts(null);
      setPostsState(INITIAL_READ_STATE);
      setCategoriesState(INITIAL_READ_STATE);
      setTagsState(INITIAL_READ_STATE);
      setAuthFailed(res.error ?? "登录状态已失效");
      return;
    }
    if (res.error || !res.data) {
      const message = readErrorMessage(res);
      // Only network/server-class failures may keep the previous values with
      // a staleness marker; other failures hide the numbers (FR-09.5).
      const keepOld = isNetworkOrServerFailure(res);
      if (!keepOld) {
        setPosts([]);
        setTotalPosts(null);
      }
      setPostsState((previous) => ({
        phase: "error",
        hasData: keepOld && previous.hasData,
        message,
        stale: keepOld && previous.hasData,
      }));
      return;
    }
    setPosts(res.data);
    // Total comes from pagination metadata only; a missing meta means the
    // total is UNKNOWN — never the recent-list length (FR-09.4).
    setTotalPosts(res.meta ? res.meta.total : null);
    setPostsState({ phase: "success", hasData: true });
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoriesState(startReading);
    const res = await clientApi.getAdminCategories();
    if (isAuthFailure(res)) {
      setCategories([]);
      setCategoriesState(INITIAL_READ_STATE);
      setAuthFailed(res.error ?? "登录状态已失效");
      return;
    }
    if (res.error || !res.data) {
      const message = readErrorMessage(res);
      const keepOld = isNetworkOrServerFailure(res);
      if (!keepOld) setCategories([]);
      setCategoriesState((previous) => ({
        phase: "error",
        hasData: keepOld && previous.hasData,
        message,
        stale: keepOld && previous.hasData,
      }));
      return;
    }
    setCategories(res.data);
    setCategoriesState({ phase: "success", hasData: true });
  }, []);

  const loadTags = useCallback(async () => {
    setTagsState(startReading);
    const res = await clientApi.getAdminTags();
    if (isAuthFailure(res)) {
      setTags([]);
      setTagsState(INITIAL_READ_STATE);
      setAuthFailed(res.error ?? "登录状态已失效");
      return;
    }
    if (res.error || !res.data) {
      const message = readErrorMessage(res);
      const keepOld = isNetworkOrServerFailure(res);
      if (!keepOld) setTags([]);
      setTagsState((previous) => ({
        phase: "error",
        hasData: keepOld && previous.hasData,
        message,
        stale: keepOld && previous.hasData,
      }));
      return;
    }
    setTags(res.data);
    setTagsState({ phase: "success", hasData: true });
  }, []);

  useEffect(() => {
    // Deferred like the editor's client-only initializations: the loaders
    // flip their phase to loading synchronously, which must not happen inside
    // the effect body (cascading renders).
    queueMicrotask(() => {
      void loadPosts();
      void loadCategories();
      void loadTags();
    });
  }, [loadPosts, loadCategories, loadTags]);

  const retryAll = () => {
    if (postsState.phase === "error") void loadPosts();
    if (categoriesState.phase === "error") void loadCategories();
    if (tagsState.phase === "error") void loadTags();
  };
  const anyStale = [postsState, categoriesState, tagsState].some((state) => state.phase === "error" && state.stale);

  if (authFailed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header admin activePath="/admin" />
        <main className="flex-1 grid place-items-center px-4 py-16">
          <div className="paper-card p-8 max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-bold font-serif text-[#1A1A1A]">登录状态已失效</h1>
            <p className="text-sm text-[#6B655C]">{authFailed}。为避免展示过期的后台数据，统计与文章信息已隐藏。</p>
            <Link
              href="/admin/login"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#E65A00] px-7 text-sm font-bold text-white hover:bg-[#C24E00] transition-colors"
            >
              重新登录
            </Link>
          </div>
        </main>
      </div>
    );
  }

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

        {/* FR-09.5: previously-loaded values kept ONLY for network/server-class
            failures, always annotated as possibly stale. */}
        {anyStale && (
          <div role="status" className="p-3.5 rounded-2xl text-xs sm:text-sm font-semibold bg-[#FDF3D7] text-[#6B5518] border border-[#F0DFA8] flex flex-wrap items-center gap-2">
            <span>部分数据读取失败，下方统计可能不是最新。</span>
            <button type="button" onClick={retryAll} className="underline font-bold cursor-pointer">重试全部</button>
          </div>
        )}

        {/* 3 Stat Cards: dark outline doodle icons, icon + number side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <DashboardStatCard
            label="文章总数"
            href="/admin/posts"
            icon={<NotePencilIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />}
            state={postsState}
            value={totalPosts}
            onRetry={() => { void loadPosts(); }}
          />
          <DashboardStatCard
            label="分类总数"
            href="/admin/categories"
            icon={<FolderOutlineIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />}
            state={categoriesState}
            value={categories.length}
            onRetry={() => { void loadCategories(); }}
          />
          <DashboardStatCard
            label="标签总数"
            href="/admin/tags"
            icon={<TagOutlineIcon className="h-14 w-14 shrink-0 text-[#2D1B0A]" />}
            state={tagsState}
            value={tags.length}
            onRetry={() => { void loadTags(); }}
          />
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
                {postsState.phase === "loading" && !postsState.hasData ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#8C8375]">
                      加载中...
                    </td>
                  </tr>
                ) : postsState.phase === "error" && !postsState.stale ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs" role="alert">
                      暂无法获取最近文章。
                      <button type="button" onClick={() => { void loadPosts(); }} className="ml-2 underline font-semibold text-[#E65A00] cursor-pointer">重试</button>
                    </td>
                  </tr>
                ) : postsState.phase === "error" && postsState.stale ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs" role="alert">
                      以下为上次成功读取的文章，可能不是最新。
                      <button type="button" onClick={() => { void loadPosts(); }} className="ml-2 underline font-semibold text-[#E65A00] cursor-pointer">重试</button>
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
