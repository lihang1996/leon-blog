"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { StatusBadge } from "../../ui/badge";
import { Modal } from "../../ui/modal";
import { CatEditorWrite, CatPeek, PottedPlant, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, CategoryItem, TagItem } from "@/lib/client-api";
import { MarkdownContent } from "../../ui/markdown-content";

export interface AdminEditorProps {
  postId?: string;
}

interface EditorSnapshotInput {
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  categoryId: string;
  tagIds: string[];
  seoTitle: string;
  seoDescription: string;
}

function serializeEditorSnapshot(input: EditorSnapshotInput) {
  return JSON.stringify({ ...input, tagIds: [...input.tagIds].sort() });
}


export function AdminEditorView({ postId }: { postId?: string }) {
  const isEdit = !!postId && postId !== "new";
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">("DRAFT");
  const [isPublishedBefore, setIsPublishedBefore] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [showSeo, setShowSeo] = useState(false);

  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // New Tag inline input state
  const [newTagName, setNewTagName] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const savedSnapshotRef = useRef("");
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const currentSnapshot = serializeEditorSnapshot({
    title,
    slug,
    excerpt,
    contentMd,
    categoryId,
    tagIds: selectedTagIds,
    seoTitle,
    seoDescription,
  });

  useEffect(() => {
    clientApi.getAdminCategories().then((res) => {
      if (res.data) setCategories(res.data);
    });
    clientApi.getAdminTags().then((res) => {
      if (res.data) setTags(res.data);
    });

    if (isEdit) {
      clientApi.getAdminPost(postId).then((res) => {
        if (res.data) {
          setTitle(res.data.title || "");
          setSlug(res.data.slug || "");
          setExcerpt(res.data.excerpt || "");
          setContentMd(res.data.contentMd || "");
          setSeoTitle(res.data.seoTitle || "");
          setSeoDescription(res.data.seoDescription || "");
          setStatus(res.data.status);
          if (res.data.status === "PUBLISHED" || res.data.publishedAt) {
            setIsPublishedBefore(true);
          }
          if (res.data.categoryId) setCategoryId(res.data.categoryId);
          const loadedTagIds = res.data.postTags && res.data.postTags.length > 0
            ? res.data.postTags.map((postTag) => postTag.tag.id)
            : res.data.tags?.map((tag) => tag.id) ?? [];
          setSelectedTagIds(loadedTagIds);
          savedSnapshotRef.current = serializeEditorSnapshot({
            title: res.data.title || "",
            slug: res.data.slug || "",
            excerpt: res.data.excerpt || "",
            contentMd: res.data.contentMd || "",
            categoryId: res.data.categoryId || "",
            tagIds: loadedTagIds,
            seoTitle: res.data.seoTitle || "",
            seoDescription: res.data.seoDescription || "",
          });
        }
        setLoading(false);
      });
    } else {
      savedSnapshotRef.current = serializeEditorSnapshot({
        title: "",
        slug: "",
        excerpt: "",
        contentMd: "",
        categoryId: "",
        tagIds: [],
        seoTitle: "",
        seoDescription: "",
      });
    }
  }, [isEdit, postId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentSnapshot === savedSnapshotRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentSnapshot]);

  const handleSaveDraft = async () => {
    if (!title.trim() || !excerpt.trim() || !contentMd.trim()) {
      setFeedback({ type: "error", msg: "请填写标题、摘要和正文" });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (isEdit) {
        const res = await clientApi.updatePost(postId, {
          content: {
            title: title.trim(),
            excerpt: excerpt.trim(),
            contentMd: contentMd.trim(),
            slug: slug.trim() || undefined,
            categoryId: categoryId || null,
            tagIds: selectedTagIds,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
          },
        });
        if (res.error) setFeedback({ type: "error", msg: res.error });
        else {
          savedSnapshotRef.current = currentSnapshot;
          setFeedback({ type: "success", msg: status === "DRAFT" ? "草稿已保存！" : "文章更新已保存！" });
        }
      } else {
        const res = await clientApi.createPost({
          title: title.trim(),
          excerpt: excerpt.trim(),
          contentMd: contentMd.trim(),
          slug: slug.trim() || undefined,
          categoryId: categoryId || null,
          tagIds: selectedTagIds,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        });
        if (res.error) setFeedback({ type: "error", msg: res.error });
        else {
          setFeedback({ type: "success", msg: "草稿创建成功！" });
          if (res.data?.id) {
            savedSnapshotRef.current = currentSnapshot;
            router.replace(`/admin/posts/${res.data.id}/edit`);
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !excerpt.trim() || !contentMd.trim()) {
      setFeedback({ type: "error", msg: "请先完整填写标题、摘要与正文" });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (isEdit) {
        const res = await clientApi.updatePost(postId, {
          content: {
            title: title.trim(),
            excerpt: excerpt.trim(),
            contentMd: contentMd.trim(),
            slug: slug.trim() || undefined,
            categoryId: categoryId || null,
            tagIds: selectedTagIds,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
          },
          action: "publish",
        });
        if (res.error) setFeedback({ type: "error", msg: res.error });
        else {
          setStatus("PUBLISHED");
          setIsPublishedBefore(true);
          savedSnapshotRef.current = currentSnapshot;
          setFeedback({ type: "success", msg: "文章发布成功！" });
        }
      } else {
        // Create draft first then publish
        const createRes = await clientApi.createPost({
          title: title.trim(),
          excerpt: excerpt.trim(),
          contentMd: contentMd.trim(),
          slug: slug.trim() || undefined,
          categoryId: categoryId || null,
          tagIds: selectedTagIds,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        });
        if (createRes.error) {
          setFeedback({ type: "error", msg: createRes.error });
        } else if (createRes.data?.id) {
          const pubRes = await clientApi.updatePost(createRes.data.id, {
            action: "publish",
          });
          if (pubRes.error) setFeedback({ type: "error", msg: pubRes.error });
          else {
            savedSnapshotRef.current = currentSnapshot;
            router.replace(`/admin/posts/${createRes.data.id}/edit`);
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!isEdit) return;
    setShowArchiveConfirm(false);
    setSaving(true);
    const res = await clientApi.updatePost(postId, { action: "archive" });
    setSaving(false);
    if (res.error) setFeedback({ type: "error", msg: res.error });
    else {
      setStatus("ARCHIVED");
      savedSnapshotRef.current = currentSnapshot;
      setFeedback({ type: "success", msg: "文章已归档" });
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim()) return;
    const slug = newTagName.trim().toLowerCase().replace(/\s+/g, "-");
    const res = await clientApi.createTag({ name: newTagName.trim(), slug });
    if (res.error) {
      setFeedback({ type: "error", msg: `创建标签失败：${res.error}` });
      return;
    }
    if (res.data) {
      setTags([...tags, res.data]);
      setSelectedTagIds([...selectedTagIds, res.data.id]);
      setNewTagName("");
      setShowAddTag(false);
    }
  };

  // Split lines for line numbers
  const lines = contentMd.split("\n");

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FDFBF7]">
        <Header admin activePath="/admin/posts" />
        <main className="flex-1 grid place-items-center text-sm text-[#8C8375]">正在加载文章…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative bg-[#FDFBF7]">
      <Header admin activePath="/admin/posts" />

      <main className="page-container flex-1 py-8 sm:py-12 space-y-8">
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

        {/* 2-Column Editor Layout: Form & Code (Left 8) + Sidebar Settings (Right 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Title, Excerpt, Markdown Editor */}
          <div className="lg:col-span-8 space-y-6">
            {/* Title Input */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[#1A1A1A]">
                标题
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如何写出优雅的代码"
                className="w-full px-5 py-3 text-base font-bold rounded-2xl bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:border-[#E65A00] focus:outline-none"
              />
            </div>

            {/* Excerpt Textarea */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[#1A1A1A]">
                摘要
              </label>
              <textarea
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
                <label className="block text-sm font-bold text-[#1A1A1A]">
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
                <label className="block text-sm font-bold text-[#1A1A1A]">
                  Slug
                </label>
                <input
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
                <label className="block text-sm font-bold text-[#1A1A1A]">
                  分类
                </label>
                <select
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
                <label className="block text-sm font-bold text-[#1A1A1A]">
                  标签
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((t) => {
                    const isSelected = selectedTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
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
                      <label className="block text-xs font-bold text-[#1A1A1A]">SEO 标题</label>
                      <input
                        type="text"
                        maxLength={60}
                        value={seoTitle}
                        onChange={(event) => setSeoTitle(event.target.value)}
                        placeholder="留空则使用文章标题"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                      />
                      <p className="text-[11px] text-[#8C8375] text-right">{seoTitle.length}/60</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[#1A1A1A]">SEO 描述</label>
                      <textarea
                        rows={3}
                        maxLength={160}
                        value={seoDescription}
                        onChange={(event) => setSeoDescription(event.target.value)}
                        placeholder="留空则使用文章摘要"
                        className="w-full px-4 py-2.5 text-xs rounded-2xl bg-white border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none resize-none"
                      />
                      <p className="text-[11px] text-[#8C8375] text-right">{seoDescription.length}/160</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Section */}
              <div className="space-y-3 pt-4 border-t border-[#F0E6D8]">
                {/* Save Draft */}
                <Button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  size="lg"
                  className="w-full"
                >
                  {status === "DRAFT" ? "保存草稿" : "保存更新"}
                </Button>

                {/* Preview */}
                {isEdit && postId ? (
                  <Button
                    href={`/admin/posts/${postId}/preview`}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    预览
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled
                    className="w-full"
                    title="先保存草稿后才能预览"
                  >
                    预览
                  </Button>
                )}

                {/* Publish */}
                <Button
                  onClick={handlePublish}
                  disabled={saving}
                  size="lg"
                  className="w-full bg-[#E65A00]"
                >
                  发布
                </Button>

                {/* Archive (if published or edit) */}
                {isEdit && status !== "ARCHIVED" && (
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={saving}
                    className="w-full py-2 text-xs font-semibold text-[#8C8375] hover:text-[#1A1A1A] transition-colors cursor-pointer"
                  >
                    归档
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Modal
        isOpen={showArchiveConfirm}
        title="确认归档文章？"
        description="归档后文章将从访客端下线，但内容会保留在后台，可随时恢复。"
        confirmText="确认归档"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </div>
  );
}
