"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { StatusBadge } from "../../ui/badge";
import { Modal } from "../../ui/modal";
import { CatPeek, PawIcon, SparkleStar, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, isAuthFailure, type AdminPostItem } from "@/lib/client-api";
import { cacheRefreshWarningText, evaluateCacheStatus } from "./editor-state";
import { CacheRefreshWarning } from "./cache-refresh-warning";
import { formatDateTime } from "@/lib/format";
import {
  buildAdminPostsHref,
  controlChangeHref,
  pageCorrectionHref,
  parseAdminPostsQuery,
} from "./admin-posts-url-state";

export function AdminPostsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // FR-08: status/sort/page live in the URL — refresh, copy, back/forward all
  // restore the exact same list. Defaults are omitted from the address.
  const parsed = parseAdminPostsQuery(searchParams);
  const { status: activeTab, sort: sortBy, page } = parsed;
  const [deleteTarget, setDeleteTarget] = useState<AdminPostItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  // 删除已确认但公开缓存刷新失败/未知（FR-03.8）：仅重试刷新，不重复删除。
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  // 身份/权限失效：清空并遮蔽旧列表与计数（FR-09），只留重新登录入口。
  const [authFailed, setAuthFailed] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; posts: AdminPostItem[]; totalPages: number; error: string | null } | null>(null);
  const [counts, setCounts] = useState<{ total: number | null; drafts: number | null; published: number | null; archived: number | null }>({ total: null, drafts: null, published: null, archived: null });
  const [countsError, setCountsError] = useState(false);
  const key = `${activeTab}:${page}:${sortBy}:${revision}`;
  const loading = result?.key !== key;
  const listError = !loading ? result?.error : null;
  const allPosts = !loading && !listError ? result?.posts ?? [] : [];
  const totalPages = !loading && !listError ? result?.totalPages ?? 1 : 1;
  const lifecycle = useRef(0);
  const deletingRef = useRef(false);

  useLayoutEffect(() => {
    lifecycle.current += 1;
    return () => {
      // Mark preserved results stale for the next Activity reveal.
      setRevision((value) => value + 1);
      lifecycle.current += 1;
      deletingRef.current = false;
      setDeleting(false);
      setDeleteTarget(null);
    };
  }, []);

  // Illegal/duplicate/default/unknown parameters normalize exactly once via a
  // replace — never a push, and the canonical form is already what this render
  // requested, so no loop and no double fetch (FR-08.3).
  useEffect(() => {
    if (parsed.needsNormalization) router.replace(buildAdminPostsHref(parsed));
  }, [parsed.needsNormalization, searchParams, router, parsed]);

  useEffect(() => {
    let active = true;
    void clientApi.getAdminPosts({ status: activeTab, page, pageSize: 20, sort: sortBy }).then((res) => {
      if (!active) return;
      if (isAuthFailure(res)) {
        setResult(null);
        setCounts({ total: null, drafts: null, published: null, archived: null });
        setAuthFailed(res.error ?? "登录状态已失效");
        return;
      }
      if (res.error || !res.data || !res.meta) {
        setResult({ key, posts: [], totalPages: 1, error: res.error || "无法加载文章分页" });
        return;
      }
      const pages = Math.max(1, res.meta.totalPages);
      // Out-of-range page (deleted last row, stale link, overflow): a single
      // replace moves to the last valid page — page 1 when there is no data —
      // so no fake empty page and no back/forward loop (FR-08.4).
      if (page > pages || res.meta.page !== page) {
        router.replace(pageCorrectionHref({ status: activeTab, sort: sortBy, page }, res.meta.page !== page ? res.meta.page : pages));
        return;
      }
      setResult({ key, posts: res.data, totalPages: pages, error: null });
    });
    return () => { active = false; };
  }, [activeTab, page, sortBy, key, router]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      clientApi.getAdminPosts({ status: "ALL", pageSize: 1 }),
      clientApi.getAdminPosts({ status: "DRAFT", pageSize: 1 }),
      clientApi.getAdminPosts({ status: "PUBLISHED", pageSize: 1 }),
      clientApi.getAdminPosts({ status: "ARCHIVED", pageSize: 1 }),
    ]).then(([all, drafts, published, archived]) => {
      if (!active) return;
      // FR-09.5 (Codex review round 1): an auth failure on ANY count request
      // masks the whole view exactly like the list request would — keeping
      // old counts visible behind a dead session is not allowed.
      const authFailure = [all, drafts, published, archived].find((res) => isAuthFailure(res));
      if (authFailure) {
        setResult(null);
        setCounts({ total: null, drafts: null, published: null, archived: null });
        setCountsError(false);
        setAuthFailed(authFailure.error ?? "登录状态已失效");
        return;
      }
      setCounts((previous) => ({
        total: !all.error && all.meta ? all.meta.total : previous.total,
        drafts: !drafts.error && drafts.meta ? drafts.meta.total : previous.drafts,
        published: !published.error && published.meta ? published.meta.total : previous.published,
        archived: !archived.error && archived.meta ? archived.meta.total : previous.archived,
      }));
      setCountsError([all, drafts, published, archived].some((res) => !!res.error || !res.meta));
    });
    return () => { active = false; };
  }, [revision]);

  const handleDelete = async () => {
    if (!deleteTarget || deletingRef.current) return;
    const target = deleteTarget;
    const generation = lifecycle.current;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const res = await clientApi.deletePost(target.id, target.version);
      if (generation !== lifecycle.current) return;
      setDeleteTarget(null);
      if (res.error) {
        setFeedback({ type: "error", msg: `删除未成功确认：${res.error}。请刷新列表核对后再操作。` });
      } else {
        // Deleting the last row of a page > 1: correct the ADDRESS down one
        // page via replace (data-driven fix, not a history entry); the URL
        // change re-runs the fetch effect for the valid page (FR-08.4).
        if (allPosts.length === 1 && page > 1) {
          router.replace(pageCorrectionHref({ status: activeTab, sort: sortBy, page }, page - 1));
        }
        setFeedback({ type: "success", msg: `已删除${target.status === "ARCHIVED" ? "已归档文章" : "草稿"}「${target.title}」` });
        // The delete committed (204); the refresh outcome rides on the header.
        const evaluated = evaluateCacheStatus(res.cacheStatus);
        setCacheWarning(
          evaluated === "failed" || evaluated === "unknown"
            ? cacheRefreshWarningText("文章已删除", evaluated)
            : null,
        );
      }
      // Refresh even when the outcome is unknown; reads are safe, writes are not retried.
      setRevision((value) => value + 1);
    } finally {
      if (generation === lifecycle.current) { deletingRef.current = false; setDeleting(false); }
    }
  };

  // One click = one refresh request; only the fixed public caches are targeted.
  const handleRetryCacheRefresh = async () => {
    if (refreshingCache) return;
    setRefreshingCache(true);
    try {
      const res = await clientApi.revalidatePublicCache();
      if (!res.error && res.data?.cacheStatus === "invalidated") setCacheWarning(null);
      // Failures keep the warning for a later manual retry.
    } finally {
      setRefreshingCache(false);
    }
  };

  if (authFailed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header admin activePath="/admin/posts" />
        <main className="flex-1 grid place-items-center px-4 py-16">
          <div className="paper-card p-8 max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-bold font-serif text-[#1A1A1A]">登录状态已失效</h1>
            <p className="text-sm text-[#6B655C]">{authFailed}。为避免展示过期的后台数据，文章列表已隐藏。</p>
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

        {/* Cache-refresh warning after a confirmed delete (FR-03.8) */}
        {cacheWarning && (
          <CacheRefreshWarning message={cacheWarning} onRetry={handleRetryCacheRefresh} refreshing={refreshingCache} />
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
          <fieldset disabled={deleting} aria-label="文章筛选与排序" className="flex flex-wrap items-center justify-between gap-4 pt-2">
            {/* Status Filter Tabs: user changes push into history and reset
                to page 1 (FR-08.2). */}
            <div className="flex items-center gap-2">
              {([
                ["ALL", `全部 (${counts.total ?? "—"})`],
                ["DRAFT", `草稿 (${counts.drafts ?? "—"})`],
                ["PUBLISHED", `已发布 (${counts.published ?? "—"})`],
                ["ARCHIVED", `已归档 (${counts.archived ?? "—"})`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-current={activeTab === value ? "true" : undefined}
                  onClick={() => router.push(controlChangeHref({ status: activeTab, sort: sortBy, page }, { status: value }))}
                  className={`px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-colors cursor-pointer ${
                    activeTab === value
                      ? "bg-[#E65A00] text-white shadow-xs"
                      : "text-[#6B655C] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown: “最新发布” maps to the published contract value. */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => router.push(controlChangeHref({ status: activeTab, sort: sortBy, page }, { sort: e.target.value as "published" | "updated" }))}
                aria-label="文章排序方式"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white border border-[#D5C7B2] text-[#3A332C] focus:outline-none cursor-pointer"
              >
                <option value="published">最新发布</option>
                <option value="updated">最后更新</option>
              </select>
            </div>
          </fieldset>
          {countsError && <p role="alert" className="text-xs text-[#E65A00]">统计刷新失败，显示上次有效数据或未知值。<button type="button" disabled={deleting} onClick={() => setRevision((value) => value + 1)}>重试</button></p>}

          {/* Posts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#F0E6D8] text-[#8C8375]">
                  <th className="pb-3 font-semibold pl-2">标题</th>
                  <th className="pb-3 font-semibold">状态</th>
                  <th className="pb-3 font-semibold">分类</th>
                  <th className="pb-3 font-semibold">{sortBy === "updated" ? "更新时间" : "发布时间"}</th>
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
                ) : listError ? (
                  <tr><td colSpan={5} className="py-12 text-center text-xs text-[#E65A00]" role="alert">{listError} <button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></td></tr>
                ) : allPosts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-[#8C8375]">
                      暂无对应文章
                    </td>
                  </tr>
                ) : (
                  allPosts.map((p) => (
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
                        {formatDateTime(
                          sortBy === "updated"
                            ? p.updatedAt || p.publishedAt || p.createdAt
                            : p.publishedAt || p.createdAt,
                        )}
                      </td>
                      <td className="py-4 text-right pr-2">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Link
                            href={
                              p.status === "PUBLISHED" && p.slug
                                ? `/posts/${p.slug}`
                                : `/admin/posts/${p.id}/preview`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B655C] hover:text-[#E65A00] hover:bg-[#FFF5EE] transition-colors"
                            title={p.status === "PUBLISHED" ? "查看文章" : "预览（未发布，仅后台可见）"}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </Link>
                          <Link
                            href={`/admin/posts/${p.id}/edit`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#E65A00] hover:bg-[#FFF5EE] transition-colors"
                            title="编辑文章"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </Link>
                          {p.status !== "PUBLISHED" && (
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => setDeleteTarget(p)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8C8375] hover:text-[#9E2F26] hover:bg-[#F7E6E2] transition-colors cursor-pointer disabled:opacity-50"
                              title={p.status === "DRAFT" ? "删除草稿" : "删除已归档文章"}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading || deleting || !!listError}
              onClick={() => router.push(pageCorrectionHref({ status: activeTab, sort: sortBy, page }, page - 1))}
            >
              上一页
            </Button>
            <span className="text-xs font-semibold text-[#6B655C]">第 {page} / {loading || listError ? "—" : totalPages} 页</span>
            <Button
              size="sm"
              disabled={page >= totalPages || loading || deleting || !!listError}
              onClick={() => router.push(pageCorrectionHref({ status: activeTab, sort: sortBy, page }, page + 1))}
            >
              下一页
            </Button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title={deleteTarget?.status === "ARCHIVED" ? "确认删除已归档文章？" : "确认删除草稿？"}
          description={
            deleteTarget?.status === "ARCHIVED"
              ? `即将永久删除已归档文章「${deleteTarget?.title}」，正文不可恢复。此操作不可撤销。`
              : `即将删除草稿「${deleteTarget?.title}」。此操作不可撤销。`
          }
          confirmText="确认删除"
          isDanger
          confirmPending={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      </main>
    </div>
  );
}
