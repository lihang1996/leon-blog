"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";
import { CatCategoryAdmin, CategoryIcon, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, type AdminCategoryItem } from "@/lib/client-api";
import { cacheRefreshWarningText, evaluateCacheStatus, mutationErrorMessage, mutationNeedsReview } from "./editor-state";
import { CacheRefreshWarning } from "./cache-refresh-warning";
import {
  categoryFormDirty,
  shouldConfirmTargetSwitch,
  type CategoryFormBaseline,
  type CategoryFormValues,
} from "./taxonomy-form-state";
import { ensureAdminLeaveGuard, unregisterAdminLeaveGuard } from "./logout-guard";
import { useEditorLeaveGuard } from "./use-editor-leave-guard";

const AVAILABLE_ICONS = ["dev", "bulb", "design", "tool", "plane", "heart", "coffee", "leaf"];

const EMPTY_CATEGORY_VALUES: CategoryFormValues = {
  name: "", slug: "", description: "", icon: "dev", sortOrder: 1,
};

export function AdminCategoriesView() {
  const [categories, setCategories] = useState<(AdminCategoryItem & { iconKey?: string })[]>([]);
  const [editingCategory, setEditingCategory] = useState<AdminCategoryItem | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("dev");
  const [sortOrder, setSortOrder] = useState(1);
  // FR-06: every editable field (name/slug/description/icon/sort) is measured
  // against this baseline; it moves ONLY on load, explicit reset, or a
  // confirmed save.
  const [baseline, setBaseline] = useState<CategoryFormBaseline>({ id: null, version: null, values: EMPTY_CATEGORY_VALUES });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Confirmed write whose public-cache refresh failed / is unknown (FR-03,
  // delivery §4.2.1-2): reported separately from the success feedback, with
  // its own fixed-set refresh retry (Codex review #4).
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<AdminCategoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const lifecycle = useRef(0);
  const busy = useRef(false);

  const formValues: CategoryFormValues = { name, slug, description, icon: selectedIcon, sortOrder };
  const dirty = categoryFormDirty(baseline, formValues);

  // FR-06: cancel/back/forward/refresh protections reuse the same leave-guard
  // machinery as the editor — including the pending-review state, so an
  // unconfirmed write can never be silently left behind. When the browser
  // lacks the Navigation API, back/forward cannot be intercepted; the banner
  // is the explicit fallback (refresh/close and in-app links stay guarded).
  const historyGuardAvailable = useEditorLeaveGuard(dirty || saving || needsReview);

  // FR-20: expose this form's unsaved/busy state to the header logout decision.
  useEffect(() => {
    ensureAdminLeaveGuard("admin-categories", {
      blocked: dirty || needsReview,
      busy: saving || deleting,
      subject: "分类管理表单",
    });
    return () => { unregisterAdminLeaveGuard("admin-categories"); };
  }, [dirty, needsReview, saving, deleting]);

  useLayoutEffect(() => {
    lifecycle.current += 1;
    return () => {
      lifecycle.current += 1;
      if (busy.current) {
        setNeedsReview(true);
        setFeedback({ type: "error", msg: "操作结果尚未确认，输入已保留。请核对列表，不要重复提交。" });
      }
      busy.current = false;
      setSaving(false);
      setDeleting(false);
      setDeleteTarget(null);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void clientApi.getAdminCategories().then((res) => {
      if (!active) return;
      if (res.data) setCategories(res.data.map((category, index) => ({ ...category, iconKey: category.icon || AVAILABLE_ICONS[index % AVAILABLE_ICONS.length] })));
      setLoadError(res.error || (!res.data ? "无法加载分类" : ""));
      setLoading(false);
    });
    return () => { active = false; setLoading(true); };
  }, [revision]);
  const fetchCategories = () => { setLoading(true); setRevision((value) => value + 1); };

  /** Unconditional form load: fields AND baseline (FR-06.3 keeps id/version). */
  const applyCategoryToForm = (cat: AdminCategoryItem & { iconKey?: string }) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || "");
    setSelectedIcon(cat.iconKey || "dev");
    setSortOrder(cat.sortOrder ?? 1);
    setBaseline({ id: cat.id, version: cat.version, values: {
      name: cat.name, slug: cat.slug, description: cat.description || "",
      icon: cat.iconKey || "dev", sortOrder: cat.sortOrder ?? 1,
    } });
  };

  const handleEdit = (cat: AdminCategoryItem & { iconKey?: string }) => {
    // FR-06.4: re-clicking the row already being edited must never overwrite
    // the user's in-progress inputs.
    if (cat.id === baseline.id) return;
    if (shouldConfirmTargetSwitch(dirty, baseline.id, cat.id)) {
      if (!window.confirm("当前分类表单有未保存的修改。确认放弃这些修改并切换到该分类吗？（取消将完整保留当前输入）")) return;
    }
    applyCategoryToForm(cat);
    setFeedback(null);
  };

  const handleResetForm = () => {
    const values = { ...EMPTY_CATEGORY_VALUES, sortOrder: categories.length + 1 };
    setEditingCategory(null);
    setName(values.name);
    setSlug(values.slug);
    setDescription(values.description);
    setSelectedIcon(values.icon);
    setSortOrder(values.sortOrder);
    setBaseline({ id: null, version: null, values });
    setFeedback(null);
    setNeedsReview(false);
  };

  const handleReloadForm = async () => {
    if (busy.current || !window.confirm("丢弃当前输入并重新载入服务器最新分类？")) return;
    const targetId = baseline.id;
    const generation = lifecycle.current;
    busy.current = true;
    setSaving(true);
    try {
      const res = await clientApi.getAdminCategories();
      if (generation !== lifecycle.current) return;
      if (!res.data || res.error) { setFeedback({ type: "error", msg: res.error || "加载失败，输入已保留" }); return; }
      setCategories(res.data.map((category) => ({ ...category, iconKey: category.icon || "dev" })));
      setLoadError("");
      const latest = res.data.find((category) => category.id === targetId);
      if (targetId && !latest) { setFeedback({ type: "error", msg: "该分类已不存在。输入已保留，可取消编辑。" }); return; }
      if (latest) applyCategoryToForm({ ...latest, iconKey: latest.icon || "dev" });
      else handleResetForm();
      setNeedsReview(false);
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || needsReview) return;
    if (!name.trim()) {
      setFeedback({ type: "error", msg: "分类名称不能为空" });
      return;
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const autoSlug = slug.trim() || name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slugPattern.test(autoSlug)) {
      setFeedback({ type: "error", msg: "Slug 仅支持小写字母、数字和连字符，中文名称请手动填写英文 Slug" });
      return;
    }
    const generation = lifecycle.current;
    busy.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const input = { name: name.trim(), slug: autoSlug, description: description.trim() || null, icon: selectedIcon, sortOrder };
      const res = editingCategory
        ? await clientApi.updateCategory(editingCategory.id, { ...input, version: editingCategory.version })
        : await clientApi.createCategory(input);
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data) {
        setNeedsReview(mutationNeedsReview(res));
        setFeedback({ type: "error", msg: mutationErrorMessage(res) });
      } else {
        const evaluated = evaluateCacheStatus(res.cacheStatus);
        setCacheWarning(
          evaluated === "failed" || evaluated === "unknown"
            ? cacheRefreshWarningText(editingCategory ? "分类已保存" : "分类已创建", evaluated)
            : null,
        );
        fetchCategories();
        handleResetForm();
        setFeedback({ type: "success", msg: editingCategory ? "分类更新成功！" : "分类创建成功！" });
      }
    } catch {
      if (generation === lifecycle.current) { setNeedsReview(true); setFeedback({ type: "error", msg: "无法确认保存结果，输入已保留，请先核对服务器内容。" }); }
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };

  // One click = one fixed-set refresh request; it never repeats the category write.
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

  const handleDelete = async () => {
    if (!deleteTarget || busy.current) return;
    const target = deleteTarget;
    const generation = lifecycle.current;
    busy.current = true;
    setDeleting(true);
    try {
      const res = await clientApi.deleteCategory(target.id, target.version);
      if (generation !== lifecycle.current) return;
      setDeleteTarget(null);
      if (res.errorCode === "CATEGORY_CONCURRENT_MODIFICATION") {
        // FR-05.5: the association set changed since the confirmation — never
        // auto-refresh the version and continue deleting; make the user
        // re-confirm on fresh data.
        setFeedback({ type: "error", msg: "分类或关联文章已变化，请刷新后重新确认。" });
      } else if (res.error) setFeedback({ type: "error", msg: `删除未成功确认：${res.error}。请核对列表后再操作。` });
      else {
        const evaluated = evaluateCacheStatus(res.cacheStatus);
        setCacheWarning(
          evaluated === "failed" || evaluated === "unknown"
            ? cacheRefreshWarningText("分类已删除", evaluated)
            : null,
        );
        if (editingCategory?.id === target.id) handleResetForm();
        // FR-05.6: the 204 carries no counts — the copy must not report the client's
        // stale snapshot number (the transaction's real count goes to the log).
        setFeedback({ type: "success", msg: `已删除分类「${target.name}」，关联文章已转为未分类` });
      }
      fetchCategories();
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setDeleting(false); }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header admin activePath="/admin/categories" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10 animate-tab-fade">
        {/* Page Title & Illustration matching redesign-admin-categories-desktop.png */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
          <div className="space-y-3">
            <div className="relative inline-block">
              <h1 className="admin-title font-extrabold font-serif text-[#1A1A1A] tracking-tight">
                分类管理
              </h1>
              <div className="absolute -bottom-2 left-0 w-24">
                <TitleBrushUnderline className="w-24 h-2 text-[#E65A00]" />
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#6B655C] pt-1">
              管理博客文章的分类，让内容组织更清晰。
            </p>
          </div>

          <div className="select-none flex justify-end">
            <CatCategoryAdmin className="w-72 sm:w-96 md:w-[420px]" />
          </div>
        </div>

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

        {cacheWarning && (
          <CacheRefreshWarning message={cacheWarning} onRetry={handleRetryCacheRefresh} refreshing={refreshingCache} />
        )}

        {needsReview && <Button variant="outline" disabled={saving || deleting} onClick={handleReloadForm}>放弃输入并重新加载</Button>}
        {!historyGuardAvailable && (
          <p role="alert" className="text-xs text-[#E65A00]">此浏览器不支持安全的后退/前进保护，离开前请保存或复制当前输入，建议使用最新版浏览器。</p>
        )}
        {/* Lock the form and row selection until the submitted snapshot settles. */}
        <fieldset disabled={saving || deleting} aria-label="分类管理" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-w-0">
          {/* Left: Form Card */}
          <div className="lg:col-span-5">
            <form onSubmit={handleSave} className="paper-card p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between border-b border-[#F0E6D8] pb-3">
                <div className="flex items-center gap-2 font-bold font-serif text-lg text-[#1A1A1A]">
                  <span className="w-1.5 h-4 bg-[#E65A00] rounded-full" />
                  <span>{editingCategory ? "编辑分类" : "添加新分类"}</span>
                </div>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      // FR-06.5: no prompt when nothing actually changed.
                      if (dirty && !window.confirm("放弃当前分类输入？（取消将完整保留当前输入）")) return;
                      handleResetForm();
                    }}
                    className="text-xs text-[#8C8375] hover:text-[#E65A00]"
                  >
                    取消编辑
                  </button>
                )}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="category-name" className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  分类名称
                </label>
                <input
                  type="text"
                  id="category-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：开发笔记"
                  required
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label htmlFor="category-slug" className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  Slug
                </label>
                <input
                  type="text"
                  id="category-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="development-notes"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                />
                <p className="text-[11px] text-[#8C8375]">留空时根据名称自动生成，仅支持小写字母、数字和连字符。</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="category-description" className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  分类描述（可选）
                </label>
                <textarea
                  id="category-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="简要描述该分类的内容或用途"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-2xl bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="category-sort" className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  排序
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  id="category-sort"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(Number(event.target.value))}
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] focus:border-[#E65A00] focus:outline-none"
                />
              </div>

              {/* Icon Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  分类图标（可选）
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {AVAILABLE_ICONS.map((iconKey) => (
                    <button
                      key={iconKey}
                      type="button"
                      aria-label={`分类图标 ${iconKey}`}
                      aria-pressed={selectedIcon === iconKey}
                      onClick={() => setSelectedIcon(iconKey)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                        selectedIcon === iconKey
                          ? "border-[#E65A00] bg-[#FFF5EE] shadow-xs"
                          : "border-[#D5C7B2] bg-white hover:border-[#E65A00]"
                      }`}
                    >
                      <CategoryIcon iconKey={iconKey} className="w-6 h-6" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving || needsReview}
                  className="w-full text-sm sm:text-base font-bold shadow-sm"
                >
                  {saving ? "保存中..." : "保存分类"}
                </Button>
              </div>
            </form>
          </div>

          {/* Right: Category List Card */}
          <div className="lg:col-span-7">
            <div className="paper-card p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 border-b border-[#F0E6D8] pb-3">
                <span className="w-1.5 h-4 bg-[#E65A00] rounded-full" />
                <h2 className="font-bold font-serif text-lg text-[#1A1A1A]">
                  分类列表
                </h2>
              </div>

              <div className="divide-y divide-[#FAF2E8]">
                {loading ? <p role="status" className="py-6 text-sm">正在加载分类…</p> : loadError ? <p role="alert" className="py-6 text-sm text-[#E65A00]">{loadError} <button type="button" onClick={fetchCategories}>重试</button></p> : categories.length === 0 ? <p className="py-6 text-sm">暂无分类</p> : categories.map((c) => (
                  <div
                    key={c.id}
                    className="py-4 flex items-center justify-between gap-4 hover:bg-[#FFFDF9] transition-colors rounded-xl px-2 group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-[#FAF6F0] border border-[#E2D6C5] flex items-center justify-center shrink-0">
                        <CategoryIcon iconKey={c.iconKey || "dev"} className="w-7 h-7" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <h3 className="text-sm sm:text-base font-bold text-[#1A1A1A]">
                          {c.name}
                        </h3>
                        {/* Slug row, matching redesign-admin-categories-desktop.png */}
                        <p className="text-[11px] font-mono text-[#8C8375]">
                          slug: {c.slug}
                        </p>
                        <p className="text-xs text-[#8C8375] line-clamp-1">
                          {c.description || "暂无描述"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-[#8C8375] font-semibold">
                        {c.postCount || 0} 篇文章
                      </span>

                      {/* Action buttons */}
                      <button
                        type="button"
                        disabled={needsReview}
                        onClick={() => handleEdit(c)}
                        className="p-1.5 rounded-lg text-[#6B655C] hover:text-[#E65A00] hover:bg-[#FFF5EE] cursor-pointer transition-colors"
                        title="编辑分类"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 rounded-lg text-[#8C8375] hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                        title="删除分类"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Summary */}
              <div className="pt-4 border-t border-[#F0E6D8] text-center text-xs text-[#8C8375]">
                {loading || loadError ? "分类数量待确认" : `共 ${categories.length} 个分类`}
              </div>
            </div>
          </div>
        </fieldset>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title="确认删除该分类？"
          description={`删除分类「${deleteTarget?.name}」后，原属于该分类的文章不会被删除，仅会被解除分类关联（变为未分类）。关联文章数：${deleteTarget?.postCount || 0} 篇。`}
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
