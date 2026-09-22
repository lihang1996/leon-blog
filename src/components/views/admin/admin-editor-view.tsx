"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { StatusBadge } from "../../ui/badge";
import { Modal } from "../../ui/modal";
import { CatEditorWrite, CatPeek, PottedPlant, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, type AdminCategoryItem, type AdminTagItem } from "@/lib/client-api";
import { slugifyLabel } from "@/lib/slug";
import { MarkdownContent } from "../../ui/markdown-content";
import { draftFromPost, editorContent, emptyEditorDraft, mutationErrorMessage, mutationNeedsReview, serializeEditorSnapshot, type EditorDraft, type MutationFailure } from "./editor-state";
import { useEditorLeaveGuard } from "./use-editor-leave-guard";

export interface AdminEditorProps {
  postId?: string;
}

export function AdminEditorView({ postId }: AdminEditorProps) {
  // Identity changes reset every field; Activity replays for the same identity do not.
  const id = postId && postId !== "new" ? postId : undefined;
  return <EditorForm key={id ?? "new"} initialPostId={id} />;
}

function EditorForm({ initialPostId }: { initialPostId?: string }) {
  const [postId, setPostId] = useState(initialPostId);
  const isEdit = !!postId;
  const [draft, setDraft] = useState(emptyEditorDraft);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeEditorSnapshot(emptyEditorDraft()));
  const { title, slug, excerpt, contentMd, categoryId, tagIds: selectedTagIds, seoTitle, seoDescription, coverImageUrl, seoImageUrl } = draft;
  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const setTitle = (value: string) => setField("title", value);
  const setSlug = (value: string) => setField("slug", value);
  const setExcerpt = (value: string) => setField("excerpt", value);
  const setContentMd = (value: string) => setField("contentMd", value);
  const setCategoryId = (value: string) => setField("categoryId", value);
  const setSeoTitle = (value: string) => setField("seoTitle", value);
  const setSeoDescription = (value: string) => setField("seoDescription", value);
  const setCoverImageUrl = (value: string) => setField("coverImageUrl", value);
  const setSeoImageUrl = (value: string) => setField("seoImageUrl", value);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">("DRAFT");
  const [isPublishedBefore, setIsPublishedBefore] = useState(false);
  const [showSeo, setShowSeo] = useState(false);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [tags, setTags] = useState<AdminTagItem[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [optionsReload, setOptionsReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!initialPostId);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(!initialPostId);
  const lifecycle = useRef(0);
  const busy = useRef(false);
  const currentSnapshot = serializeEditorSnapshot(draft);
  const dirty = currentSnapshot !== savedSnapshot;
  const historyGuardAvailable = useEditorLeaveGuard(dirty || saving || needsReview || !!newTagName);
  const disabled = saving || loading;

  useLayoutEffect(() => {
    lifecycle.current += 1;
    return () => {
      lifecycle.current += 1;
      if (busy.current) {
        busy.current = false;
        setSaving(false);
        setNeedsReview(true);
        setFeedback({ type: "error", msg: "操作期间离开了页面，结果尚未确认。输入已保留，请先核对服务器内容，不要重复提交。" });
      }
      if (initialized.current) setLoading(false);
      setShowArchiveConfirm(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([clientApi.getAdminCategories(), clientApi.getAdminTags()]).then(([categoryRes, tagRes]) => {
      if (!active) return;
      if (categoryRes.data) setCategories(categoryRes.data);
      if (tagRes.data) setTags(tagRes.data);
      setOptionsError([categoryRes.error, tagRes.error].filter(Boolean).join("；"));
    });
    return () => { active = false; };
  }, [optionsReload]);

  const applyLoadedPost = (post: NonNullable<Awaited<ReturnType<typeof clientApi.getAdminPost>>["data"]>) => {
    const loaded = draftFromPost(post);
    setDraft(loaded);
    setSavedSnapshot(serializeEditorSnapshot(loaded));
    setVersion(post.version);
    setStatus(post.status);
    setIsPublishedBefore(post.status === "PUBLISHED" || !!post.publishedAt);
    setLoadFailed(false);
    setNeedsReview(false);
    initialized.current = true;
  };

  useEffect(() => {
    if (initialized.current || !initialPostId) return;
    let active = true;
    void clientApi.getAdminPost(initialPostId).then((res) => {
      if (!active) return;
      if (res.data && typeof res.data.version === "number") {
        applyLoadedPost(res.data);
      } else {
        setLoadFailed(true);
        setFeedback({ type: "error", msg: res.error || "文章不存在或版本无法加载" });
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [initialPostId]);

  const handleReload = async () => {
    if (!postId || busy.current || loading) return;
    if ((dirty || needsReview || newTagName) && !window.confirm("重新加载将丢弃当前未保存的输入，并载入服务器最新内容。确定继续吗？")) return;
    const generation = lifecycle.current;
    setLoading(true);
    const res = await clientApi.getAdminPost(postId);
    if (generation !== lifecycle.current) return;
    if (res.data && typeof res.data.version === "number") {
      applyLoadedPost(res.data);
      setNewTagName("");
      setFeedback({ type: "success", msg: "已载入服务器最新内容" });
    } else {
      // Failed reloads keep both the draft and its original version baseline.
      setFeedback({ type: "error", msg: res.error || "无法加载文章版本，当前输入已保留" });
    }
    setLoading(false);
  };

  const showMutationError = (res: MutationFailure) => {
    setNeedsReview(mutationNeedsReview(res));
    setFeedback({ type: "error", msg: mutationErrorMessage(res) });
  };

  const saveContent = async (publish = false) => {
    if (busy.current || disabled || needsReview) return;
    if (!title.trim() || !excerpt.trim() || !contentMd.trim()) {
      setFeedback({ type: "error", msg: "请填写标题、摘要和正文" });
      return;
    }
    if (postId && version === null) return;
    const generation = lifecycle.current;
    const submittedSnapshot = currentSnapshot;
    const payload = editorContent(draft, isPublishedBefore);
    busy.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      let id = postId;
      let nextVersion = version;
      if (!id) {
        const created = await clientApi.createPost(payload);
        if (generation !== lifecycle.current) return;
        if (created.error || !created.data?.id || typeof created.data.version !== "number") {
          showMutationError(created);
          return;
        }
        id = created.data.id;
        nextVersion = created.data.version;
        // Keep the new identity immediately, even if the following publish fails.
        setPostId(id);
        setVersion(nextVersion);
        setStatus(created.data.status);
        initialized.current = true;
        setSavedSnapshot(submittedSnapshot);
        if (!publish) {
          setFeedback({ type: "success", msg: "草稿创建成功！后续保存将更新同一篇文章。" });
          return;
        }
      }
      const res = await clientApi.updatePost(id, {
        content: payload, ...(publish ? { action: "publish" as const } : {}), version: nextVersion!,
      });
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data || typeof res.data.version !== "number") {
        showMutationError(res);
        return;
      }
      setVersion(res.data.version);
      setStatus(res.data.status);
      setIsPublishedBefore(res.data.status === "PUBLISHED" || !!res.data.publishedAt);
      setSavedSnapshot(submittedSnapshot);
      setFeedback({ type: "success", msg: publish ? "文章发布成功！" : "文章已保存！" });
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "网络异常，无法确认保存结果" });
    } finally {
      if (generation === lifecycle.current) {
        busy.current = false;
        setSaving(false);
      }
    }
  };
  const handleSaveDraft = () => saveContent();
  const handlePublish = () => saveContent(true);

  const changeStatus = async (action: "archive" | "restore") => {
    if (!postId || version === null || busy.current || disabled || needsReview) return;
    const generation = lifecycle.current;
    busy.current = true;
    setShowArchiveConfirm(false);
    setSaving(true);
    try {
      const res = await clientApi.updatePost(postId, { action, version });
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data || typeof res.data.version !== "number") showMutationError(res);
      else {
        setStatus(res.data.status);
        setVersion(res.data.version);
        // Status-only operations must never mark local content as saved.
        setFeedback({ type: "success", msg: action === "archive" ? "文章已归档，未保存的输入仍保留" : "文章已恢复为草稿" });
      }
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "网络异常，无法确认操作结果" });
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };
  const handleArchive = () => changeStatus("archive");
  const handleRestore = () => changeStatus("restore");

  const toggleTag = (tagId: string) => {
    setDraft((current) => ({ ...current, tagIds: current.tagIds.includes(tagId) ? current.tagIds.filter((id) => id !== tagId) : [...current.tagIds, tagId] }));
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim() || busy.current || disabled || needsReview) return;
    const generation = lifecycle.current;
    busy.current = true;
    setSaving(true);
    try {
      const res = await clientApi.createTag({ name: newTagName.trim(), slug: slugifyLabel(newTagName.trim(), "tag") });
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data) showMutationError(res);
      else {
        const tag = res.data;
        setTags((current) => [...current, tag]);
        setDraft((current) => ({ ...current, tagIds: [...current.tagIds, tag.id] }));
        setNewTagName("");
        setShowAddTag(false);
      }
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "无法确认标签创建结果" });
    } finally {
      if (generation === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  };

  // Split lines for line numbers
  const lines = contentMd.split("\n");

  if (loading && version === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header admin activePath="/admin/posts" />
        <main className="flex-1 grid place-items-center text-sm text-[#8C8375]">正在加载文章…</main>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header admin activePath="/admin/posts" />
        <main className="page-container flex-1 py-16 space-y-6">
          <div className="p-4 rounded-2xl bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA] text-sm font-semibold">
            {feedback?.msg || "文章不存在或无法加载"}
          </div>
          <Button onClick={handleReload} disabled={loading} variant="outline" size="md">重新加载</Button>
          <Button href="/admin/posts" variant="outline" size="md">
            ← 返回文章列表
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header admin activePath="/admin/posts" />

      <main className="page-container flex-1 py-8 sm:py-12 pb-28 space-y-8">
        {/* Page Title & Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-4">
              <div className="relative inline-block">
                <h1 className="admin-title font-extrabold font-serif text-[#1A1A1A] tracking-tight">
                  {isEdit ? "编辑文章" : "新建文章"}
                </h1>
                <div className="absolute -bottom-2 left-0 w-24">
                  <TitleBrushUnderline className="w-24 h-2 text-[#E65A00]" />
                </div>
              </div>
              <CatEditorWrite className="w-36 h-24 select-none" />
              <StatusBadge status={status} />
            </div>
            <p className="text-xs sm:text-sm text-[#6B655C] pt-1">
              认真写作的每一刻，都是在和未来的自己对话。
            </p>
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

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B655C]" role="status">
          <span>{loading ? "正在重新加载…" : saving ? "正在保存…" : dirty ? "有未保存的修改" : "无未保存的修改"}</span>
          {postId && <Button variant="outline" size="sm" disabled={disabled} onClick={handleReload}>重新加载服务器内容</Button>}
          {postId && !initialPostId && <Button href={`/admin/posts/${postId}/edit`} variant="outline" size="sm">打开已保存的文章</Button>}
          {needsReview && !postId && <Button href="/admin/posts" target="_blank" rel="noreferrer" variant="outline" size="sm">在新标签页核对文章列表</Button>}
          {needsReview && <span>请先复制需要保留的文字，再核对服务器内容；不会自动重试。</span>}
        </div>
        {!historyGuardAvailable && <p role="alert" className="text-xs text-[#E65A00]">此浏览器不支持安全的后退/前进保护。离开前请保存或复制正文，建议使用最新版浏览器。</p>}
        {optionsError && <p role="alert" className="text-xs text-[#E65A00]">分类或标签加载失败：{optionsError} <button type="button" disabled={disabled} onClick={() => setOptionsReload((value) => value + 1)}>重试</button></p>}

        {/* Disable every editable control during a write or explicit reload. */}
        <fieldset disabled={disabled} aria-label="文章内容与设置" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-w-0">
          {/* Left Column: Title, Excerpt, Markdown Editor */}
          <div className="lg:col-span-8 space-y-6">
            {/* Title Input */}
            <div className="space-y-2">
              <label htmlFor="editor-title" className="block text-sm font-bold text-[#1A1A1A]">
                标题
              </label>
              <input
                type="text"
                id="editor-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如何写出优雅的代码"
                className="w-full px-5 py-3 text-base font-bold rounded-2xl bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:border-[#E65A00] focus:outline-none"
              />
            </div>

            {/* Excerpt Textarea */}
            <div className="space-y-2">
              <label htmlFor="editor-excerpt" className="block text-sm font-bold text-[#1A1A1A]">
                摘要
              </label>
              <textarea
                id="editor-excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                placeholder="优雅的代码不仅仅是能运行，更是易读、易维护、易扩展..."
                className="w-full px-5 py-3 text-xs sm:text-sm rounded-2xl bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:border-[#E65A00] focus:outline-none leading-relaxed"
              />
            </div>

            {/* Content (Markdown) Header & Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="editor-content" className="block text-sm font-bold text-[#1A1A1A]">
                  正文 (Markdown)
                </label>
                <div className="inline-flex rounded-full bg-[#FAF6F0] border border-[#D5C7B2] p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorTab("edit")}
                    className={`px-3.5 py-1 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                      editorTab === "edit"
                        ? "bg-[#E65A00] text-white"
                        : "text-[#6B655C] hover:text-[#1A1A1A]"
                    }`}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("preview")}
                    className={`px-3.5 py-1 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                      editorTab === "preview"
                        ? "bg-[#E65A00] text-white"
                        : "text-[#6B655C] hover:text-[#1A1A1A]"
                    }`}
                  >
                    预览
                  </button>
                </div>
              </div>

              {/* Dark Code Theme Editor Box */}
              {editorTab === "edit" ? (
                <div className="code-container relative group min-h-[380px] flex">
                  {/* Peeking Cat in top right corner */}
                  <div className="absolute -top-7 right-4 select-none z-20">
                    <CatPeek className="w-18 h-14" speech="喵~" />
                  </div>

                  {/* Line Numbers Column (scroll-synced with the textarea) */}
                  <div
                    ref={lineNumbersRef}
                    className="py-4 pl-3 pr-2 select-none text-right font-mono text-xs text-[#526173] border-r border-[#2D3748] bg-[#191F26] min-w-[36px] overflow-hidden"
                  >
                    {lines.map((_, i) => (
                      <div key={i} className="leading-6">
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Editor Textarea */}
                  <textarea
                    id="editor-content"
                    value={contentMd}
                    onChange={(e) => setContentMd(e.target.value)}
                    onScroll={(e) => {
                      if (lineNumbersRef.current) {
                        lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
                      }
                    }}
                    rows={16}
                    className="flex-1 p-4 bg-transparent text-[#E2E8F0] font-mono text-xs sm:text-sm leading-6 focus:outline-none resize-y"
                    placeholder="输入 Markdown 正文内容..."
                  />
                </div>
              ) : (
                <div className="paper-card p-6 min-h-[380px] text-[#2E2822] space-y-4">
                  {contentMd.trim() ? <MarkdownContent content={contentMd} compact /> : <p className="text-sm text-[#8C8375]">正文预览会显示在这里。</p>}
                </div>
              )}
            </div>

            {/* Bottom Potted Plant */}
            <div className="pt-2">
              <PottedPlant className="w-16 h-24" />
            </div>
          </div>

          {/* Right Sidebar: Slug, Category, Tags & Action Buttons */}
          <div className="lg:col-span-4 space-y-6">
            <div className="paper-card p-6 space-y-6">
              {/* Slug */}
              <div className="space-y-1.5">
                <label htmlFor="editor-slug" className="block text-sm font-bold text-[#1A1A1A]">
                  Slug
                </label>
                <input
                  id="editor-slug"
                  type="text"
                  value={slug}
                  disabled={isPublishedBefore}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="how-to-write-elegant-code"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-[#FAF6F0]/70 border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:bg-white focus:border-[#E65A00] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="text-[11px] text-[#8C8375]">
                  {isPublishedBefore ? "发布后不可修改" : "可自定义 URL 路径，留空将自动生成"}
                </span>
              </div>

              {/* Category Select */}
              <div className="space-y-1.5">
                <label htmlFor="editor-category" className="block text-sm font-bold text-[#1A1A1A]">
                  分类
                </label>
                <select
                  id="editor-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] focus:border-[#E65A00] focus:outline-none cursor-pointer"
                >
                  <option value="">未分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags Multi-select Chips */}
              <div className="space-y-2">
                <p className="block text-sm font-bold text-[#1A1A1A]">
                  标签
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((t) => {
                    const isSelected = selectedTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTag(t.id)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#E65A00] text-white border-[#E65A00]"
                            : "bg-transparent text-[#E65A00] border-[#E65A00] hover:bg-[#FFF5EE]"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddTag(!showAddTag)}
                    className="px-3 py-1 text-xs font-semibold rounded-full border border-dashed border-[#8C8375] text-[#6B655C] hover:border-[#E65A00] hover:text-[#E65A00] transition-colors cursor-pointer"
                  >
                    + 添加标签
                  </button>
                </div>

                {/* Inline Add Tag input */}
                {showAddTag && (
                  <div className="flex items-center gap-2 pt-2 animate-fade-in">
                    <input
                      type="text"
                      aria-label="新标签名"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="新标签名..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-full border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewTag}
                      className="px-3 py-1.5 text-xs font-bold rounded-full bg-[#E65A00] text-white"
                    >
                      确定
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-[#F0E6D8] pt-4">
                <button
                  type="button"
                  onClick={() => setShowSeo((open) => !open)}
                  className="w-full min-h-11 flex items-center justify-between text-sm font-bold text-[#1A1A1A]"
                  aria-expanded={showSeo}
                >
                  <span>SEO 设置</span>
                  <span className="text-[#E65A00]">{showSeo ? "−" : "+"}</span>
                </button>
                {showSeo && (
                  <div className="space-y-4 pt-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <label htmlFor="editor-seo-title" className="block text-xs font-bold text-[#1A1A1A]">SEO 标题</label>
                      <input
                        type="text"
                        maxLength={60}
                        id="editor-seo-title"
                        value={seoTitle}
                        onChange={(event) => setSeoTitle(event.target.value)}
                        placeholder="留空则使用文章标题"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                      />
                      <p className="text-[11px] text-[#8C8375] text-right">{seoTitle.length}/60</p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-seo-description" className="block text-xs font-bold text-[#1A1A1A]">SEO 描述</label>
                      <textarea
                        rows={3}
                        maxLength={160}
                        id="editor-seo-description"
                        value={seoDescription}
                        onChange={(event) => setSeoDescription(event.target.value)}
                        placeholder="留空则使用文章摘要"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none resize-none"
                      />
                      <p className="text-[11px] text-[#8C8375] text-right">{seoDescription.length}/160</p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-cover-url" className="block text-xs font-bold text-[#1A1A1A]">封面图片 URL</label>
                      <input
                        type="url"
                        id="editor-cover-url"
                        value={coverImageUrl}
                        onChange={(event) => setCoverImageUrl(event.target.value)}
                        placeholder="站内路径或白名单 HTTPS 地址"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-share-url" className="block text-xs font-bold text-[#1A1A1A]">分享图片 URL</label>
                      <input
                        type="url"
                        id="editor-share-url"
                        value={seoImageUrl}
                        onChange={(event) => setSeoImageUrl(event.target.value)}
                        placeholder="留空则使用封面图"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </main>

      {/* Fixed bottom action bar, matching redesign-admin-editor-desktop.png */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-[#F0E6D8] backdrop-blur bg-[color-mix(in_srgb,var(--color-bg)_95%,transparent)]">
        <div className="page-container py-3 flex items-center justify-center gap-3 sm:gap-4">
          <Button onClick={handleSaveDraft} disabled={disabled || needsReview} size="md">
            {status === "DRAFT" ? "保存草稿" : "保存更新"}
          </Button>
          {isEdit && postId ? (
            <Button
              href={`/admin/posts/${postId}/preview`}
              variant="outline"
              size="md"
              target="_blank"
              rel="noreferrer"
            >
              预览
            </Button>
          ) : (
            <Button variant="outline" size="md" disabled title="先保存草稿后才能预览">
              预览
            </Button>
          )}
          {status === "DRAFT" && (
            <Button onClick={handlePublish} disabled={disabled || needsReview} size="md">
              发布
            </Button>
          )}
          {isEdit && status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              disabled={disabled || needsReview}
              className="px-2 py-2 text-xs font-semibold text-[#8C8375] hover:text-[#1A1A1A] transition-colors cursor-pointer"
            >
              归档
            </button>
          )}
          {isEdit && status === "ARCHIVED" && (
            <Button onClick={handleRestore} disabled={disabled || needsReview} size="md">
              恢复为草稿
            </Button>
          )}
        </div>
      </div>
      <Modal
        isOpen={showArchiveConfirm}
        title="确认归档文章？"
        description="归档后文章将从访客端下线，但内容会保留在后台，可随时恢复。未保存的正文修改不会随归档写入。"
        confirmText="确认归档"
        confirmPending={saving}
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </div>
  );
}
