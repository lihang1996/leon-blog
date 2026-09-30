"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";
import { CatTagsSleep, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, type AdminTagItem } from "@/lib/client-api";
import { slugifyLabel } from "@/lib/slug";
import { cacheRefreshWarningText, evaluateCacheStatus, mutationErrorMessage, mutationNeedsReview } from "./editor-state";
import { CacheRefreshWarning } from "./cache-refresh-warning";
import { shouldConfirmTargetSwitch, tagFormDirty, type TagFormBaseline } from "./taxonomy-form-state";
import { ensureAdminLeaveGuard, unregisterAdminLeaveGuard } from "./logout-guard";
import { useEditorLeaveGuard } from "./use-editor-leave-guard";

/**
 * One tag pill with its always-visible edit and delete entries (FR-13):
 * nothing here is hover-gated; the delete control keeps the accessible name
 * `删除标签 {名称}`, a visible focus ring, and a 44px touch target. Both
 * buttons only dispatch to the parent's existing edit/confirm flows.
 */
export function AdminTagPill({
  tag,
  needsReview,
  onEdit,
  onDelete,
}: {
  tag: AdminTagItem;
  needsReview: boolean;
  onEdit: (tag: AdminTagItem) => void;
  onDelete: (tag: AdminTagItem) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-[#E65A00] bg-white text-[#E65A00] text-xs sm:text-sm font-semibold transition-all hover:bg-[#FFF5EE]">
      <span>{tag.name}</span>
      <span className="text-xs text-[#E65A00]/80">{tag.postCount || 0}</span>
      <button
        type="button"
        disabled={needsReview}
        onClick={() => onEdit(tag)}
        className="ml-1 inline-flex min-h-11 items-center px-1.5 text-[#6B655C] hover:text-[#E65A00] transition-colors cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#E65A00]"
        title="编辑标签"
      >
        编辑
      </button>
      <button
        type="button"
        onClick={() => onDelete(tag)}
        className="ml-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-lg leading-none text-[#8C8375] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#E65A00]"
        title="删除标签"
        aria-label={`删除标签 ${tag.name}`}
      >
        ×
      </button>
    </div>
  );
}

export function AdminTagsView() {  const [tags, setTags] = useState<AdminTagItem[]>([]);
  const [name, setName] = useState("");
  const [editingTag, setEditingTag] = useState<AdminTagItem | null>(null);
  // FR-06: the single editable field's baseline; create mode starts at "".
  const [baseline, setBaseline] = useState<TagFormBaseline>({ id: null, version: null, name: "" });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTagItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Confirmed write whose public-cache refresh failed / is unknown (FR-03,
  // delivery §4.2.1-2): separate warning + fixed-set refresh retry only
  // (Codex review #4).
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);

  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const lifecycle = useRef(0);
  const busy = useRef(false);

  const dirty = tagFormDirty(baseline, name);

  // FR-06: leaving with unsaved tag text (or an unconfirmed write) confirms
  // first; the guard covers cancel paths, back/forward, and refresh. Without
  // the Navigation API, back/forward cannot be intercepted — the banner is
  // the explicit fallback (refresh/close and in-app links stay guarded).
  const historyGuardAvailable = useEditorLeaveGuard(dirty || saving || needsReview);

  // FR-20: header logout decision sees this form's unsaved/busy state.
  useEffect(() => {
    ensureAdminLeaveGuard("admin-tags", {
      blocked: dirty || needsReview,
      busy: saving || deleting,
      subject: "标签管理表单",
    });
    return () => { unregisterAdminLeaveGuard("admin-tags"); };
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
    void clientApi.getAdminTags().then((res) => {
      if (!active) return;
      if (res.data) setTags(res.data);
      setLoadError(res.error || (!res.data ? "无法加载标签" : ""));
      setLoading(false);
    });
    return () => { active = false; setLoading(true); };
  }, [revision]);
  const fetchTags = () => { setLoading(true); setRevision((value) => value + 1); };

  /** Unconditional form load: name AND baseline (FR-06.3 keeps id/version). */
  const applyTagToForm = (tag: AdminTagItem | null) => {
    setEditingTag(tag);
    setName(tag?.name ?? "");
    setBaseline({ id: tag?.id ?? null, version: tag?.version ?? null, name: tag?.name ?? "" });
  };

  const handleReloadForm = async () => {
    if (busy.current || !window.confirm("丢弃当前输入并重新载入服务器最新标签？")) return;
    const targetId = baseline.id;
    const generation = lifecycle.current;
    busy.current = true;
    setSaving(true);
    try {
      const res = await clientApi.getAdminTags();
      if (generation !== lifecycle.current) return;
      if (!res.data || res.error) { setFeedback({ type: "error", msg: res.error || "加载失败，输入已保留" }); return; }
      setTags(res.data);
      setLoadError("");
      const latest = res.data.find((tag) => tag.id === targetId);
      if (targetId && !latest) { setFeedback({ type: "error", msg: "该标签已不存在。输入已保留，可取消编辑。" }); return; }
      applyTagToForm(latest ?? null);
      setFeedback(null);
      setNeedsReview(false);
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || needsReview) return;
    if (!name.trim()) {
      setFeedback({ type: "error", msg: "标签名称不能为空" });
      return;
    }

    const trimmed = name.trim();
    // 中文名（无拉丁 slug 可用）自动回退 tag-随机串，与文章 slug 策略一致。
    const slug = editingTag?.slug ?? slugifyLabel(trimmed, "tag");
    const generation = lifecycle.current;
    busy.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const res = editingTag
        ? await clientApi.updateTag(editingTag.id, { name: trimmed, slug, version: editingTag.version })
        : await clientApi.createTag({ name: trimmed, slug });
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data) {
        setNeedsReview(mutationNeedsReview(res));
        setFeedback({ type: "error", msg: mutationErrorMessage(res) });
      } else {
        const evaluated = evaluateCacheStatus(res.cacheStatus);
        setCacheWarning(
          evaluated === "failed" || evaluated === "unknown"
            ? cacheRefreshWarningText(editingTag ? "标签已保存" : "标签已创建", evaluated)
            : null,
        );
        // Confirmed save moves the baseline (FR-06.5).
        setName("");
        setEditingTag(null);
        setBaseline({ id: null, version: null, name: "" });
        setFeedback({ type: "success", msg: editingTag ? "标签更新成功！" : "标签添加成功！" });
        fetchTags();
      }
    } catch {
      if (generation === lifecycle.current) { setNeedsReview(true); setFeedback({ type: "error", msg: "无法确认保存结果，输入已保留，请先核对服务器内容。" }); }
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };

  // One click = one fixed-set refresh request; it never repeats the tag write.
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
      const res = await clientApi.deleteTag(target.id, target.version);
      if (generation !== lifecycle.current) return;
      setDeleteTarget(null);
      if (res.errorCode === "TAG_CONCURRENT_MODIFICATION") {
        // FR-05.5: the association set changed since the confirmation — never
        // auto-refresh the version and continue deleting.
        setFeedback({ type: "error", msg: "标签或关联文章已变化，请刷新后重新确认。" });
      } else if (res.error) setFeedback({ type: "error", msg: `删除未成功确认：${res.error}。请核对列表后再操作。` });
      else {
        const evaluated = evaluateCacheStatus(res.cacheStatus);
        setCacheWarning(
          evaluated === "failed" || evaluated === "unknown"
            ? cacheRefreshWarningText("标签已删除", evaluated)
            : null,
        );
        if (editingTag?.id === target.id) {
          setEditingTag(null);
          setName("");
          setBaseline({ id: null, version: null, name: "" });
          setNeedsReview(false);
        }
        // FR-05.6: no client-side counts in the success copy; articles are kept.
        setFeedback({ type: "success", msg: `已删除标签「${target.name}」，相关关联已解除，文章保留` });
      }
      fetchTags();
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setDeleting(false); }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header admin activePath="/admin/tags" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-10 animate-tab-fade">
        {/* Page Header with Sleeping Cat Illustration matching redesign-admin-tags-desktop.png */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
          <div className="space-y-3">
            <div className="relative inline-block">
              <h1 className="admin-title font-extrabold font-serif text-[#1A1A1A] tracking-tight">
                标签管理
              </h1>
              <div className="absolute -bottom-2 left-0 w-24">
                <TitleBrushUnderline className="w-24 h-2 text-[#E65A00]" />
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#6B655C] pt-1">
              管理博客标签，优化内容分类与检索体验。
            </p>
          </div>

          <div className="select-none flex justify-end">
            <CatTagsSleep className="w-72 sm:w-96 md:w-[420px]" />
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
        {/* Lock both input and row selection until the submitted snapshot settles. */}
        <fieldset disabled={saving || deleting} aria-label="标签管理" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-w-0">
          {/* Left: Input & Tag Cloud Grid */}
          <div className="lg:col-span-8 space-y-6">
            <div className="paper-card p-6 sm:p-8 space-y-6">
              {/* Add Tag Section */}
              <div className="space-y-3 border-b border-[#F0E6D8] pb-6">
                <div className="flex items-center gap-2 font-bold font-serif text-lg text-[#1A1A1A]">
                  <span className="w-1.5 h-4 bg-[#E65A00] rounded-full" />
                  <span>{editingTag ? "编辑标签" : "添加标签"}</span>
                </div>

                <form onSubmit={handleAddTag} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    aria-label="标签名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入标签名称（如：前端、设计、思考）"
                    className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                  />
                  <Button type="submit" disabled={saving || needsReview} size="md" className="px-7 shrink-0">
                    {editingTag ? "保存标签" : "添加标签"}
                  </Button>
                  {editingTag && (
                    <button
                      type="button"
                      onClick={() => {
                        // FR-06.5: no prompt when the name was never changed.
                        if (dirty && !window.confirm("放弃当前标签输入？（取消将完整保留当前输入）")) return;
                        setEditingTag(null);
                        setName("");
                        setBaseline({ id: null, version: null, name: "" });
                        setNeedsReview(false);
                        setFeedback(null);
                      }}
                      className="min-h-11 px-4 text-xs font-semibold text-[#6B655C] hover:text-[#E65A00]"
                    >
                      取消
                    </button>
                  )}
                </form>

                <p className="text-xs text-[#8C8375] flex items-center gap-1">
                  <span>💡</span>
                  <span>提示：按下回车键可快速添加标签</span>
                </p>
              </div>

              {/* Tag List Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-bold font-serif text-lg text-[#1A1A1A]">
                  <span className="w-1.5 h-4 bg-[#E65A00] rounded-full" />
                  <span>标签列表</span>
                  <span className="text-xs text-[#8C8375] font-normal font-sans">
                    {loading || loadError ? "（数量待确认）" : `（共 ${tags.length} 个）`}
                  </span>
                </div>

                {/* Tag Pills Grid */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {loading ? <p role="status" className="py-6 text-sm">正在加载标签…</p> : loadError ? <p role="alert" className="py-6 text-sm text-[#E65A00]">{loadError} <button type="button" onClick={fetchTags}>重试</button></p> : tags.length === 0 ? <p className="py-6 text-sm">暂无标签</p> : tags.map((tag) => (
                    <AdminTagPill
                      key={tag.id}
                      tag={tag}
                      needsReview={needsReview}
                      onEdit={(target) => {
                        // FR-06.4: re-clicking the tag being edited never
                        // overwrites in-progress input; switching confirms.
                        if (target.id === baseline.id) return;
                        if (shouldConfirmTargetSwitch(dirty, baseline.id, target.id)) {
                          if (!window.confirm("当前标签输入尚未保存。确认放弃并切换到该标签吗？（取消将完整保留当前输入）")) return;
                        }
                        applyTagToForm(target);
                        setFeedback(null);
                      }}
                      onDelete={(target) => setDeleteTarget(target)}
                    />
                  ))}
                </div>

                {/* Mustard tip box, matching redesign-admin-tags-desktop.png */}
                <div className="flex items-start gap-2.5 rounded-2xl bg-[#FDF3D7] border border-[#F0DFA8] px-4 py-3 text-xs sm:text-sm text-[#6B5518]">
                  <span aria-hidden="true">💡</span>
                  <p className="leading-relaxed">
                    <span className="font-bold">提示：</span>
                    删除标签不会删除已关联的文章，只会解除关联关系。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Management Guidelines Card */}
          <div className="lg:col-span-4">
            <div className="paper-card p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-[#F0E6D8] pb-3">
                <span className="w-1.5 h-4 bg-[#E65A00] rounded-full" />
                <h3 className="font-bold font-serif text-lg text-[#1A1A1A]">
                  管理说明
                </h3>
              </div>

              <div className="space-y-5 text-xs sm:text-sm text-[#6B655C]">
                {/* Rule 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#FFF5EE] text-[#E65A00] flex items-center justify-center shrink-0 mt-0.5">
                    🏷️
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-[#1A1A1A]">标签作用</h4>
                    <p className="leading-relaxed">
                      标签可以帮助读者更好地发现和浏览相关内容，提高博客的可读性和检索性。
                    </p>
                  </div>
                </div>

                {/* Rule 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] text-[#D9A821] flex items-center justify-center shrink-0 mt-0.5">
                    📝
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-[#1A1A1A]">使用建议</h4>
                    <p className="leading-relaxed">
                      为文章添加合适标签，避免使用过于宽泛或重复的标签，保持标签的准确性。
                    </p>
                  </div>
                </div>

                {/* Rule 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#EBF4EC] text-[#2E7D32] flex items-center justify-center shrink-0 mt-0.5">
                    🗑️
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-[#1A1A1A]">删除说明</h4>
                    <p className="leading-relaxed">
                      删除标签会解除该标签与所有文章的关联，但不会删除相关文章。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title="确认删除该标签？"
          description={`删除标签「${deleteTarget?.name}」后，仅会解除与相关文章的关联，文章本身不会被删除。关联文章数：${deleteTarget?.postCount || 0} 篇。`}
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
