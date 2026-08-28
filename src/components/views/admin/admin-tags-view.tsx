"use client";

import React, { useEffect, useState } from "react";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";
import { CatTagsSleep, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, TagItem } from "@/lib/client-api";

export function AdminTagsView() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [name, setName] = useState("");
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagItem | null>(null);

  const fetchTags = async () => {
    const res = await clientApi.getAdminTags();
      if (res.data) {
        setTags(res.data);
      }
  };

  useEffect(() => {
    let active = true;
    void clientApi.getAdminTags().then((res) => {
      if (active && res.data) setTags(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const trimmed = name.trim();
    const slug = trimmed.toLowerCase().replace(/\s+/g, "-");
    setSaving(true);
    setFeedback(null);

    try {
      const res = editingTag
        ? await clientApi.updateTag(editingTag.id, { name: trimmed, slug })
        : await clientApi.createTag({ name: trimmed, slug });
      if (res.error) {
        setFeedback({ type: "error", msg: res.error });
      } else {
        setName("");
        setEditingTag(null);
        setFeedback({ type: "success", msg: editingTag ? "标签更新成功！" : "标签添加成功！" });
        await fetchTags();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const res = await clientApi.deleteTag(target.id);
    if (res.error) {
      setFeedback({ type: "error", msg: `删除失败：${res.error}` });
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    setTags((prev) => prev.filter((t) => t.id !== target.id));
    setFeedback({ type: "success", msg: `已删除标签「${target.name}」，${target.postCount || 0} 篇文章的关联已解除` });
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-[#FDFBF7]">
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

        {/* 2-Column Layout: Tag Operations (Left 8) + Management Guidelines (Right 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入标签名称（如：前端、设计、思考）"
                    className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                  />
                  <Button type="submit" disabled={saving} size="md" className="px-7 shrink-0">
                    {editingTag ? "保存标签" : "添加标签"}
                  </Button>
                  {editingTag && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTag(null);
                        setName("");
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
                    （共 {tags.length} 个）
                  </span>
                </div>

                {/* Tag Pills Grid */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="group relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#E65A00] bg-white text-[#E65A00] text-xs sm:text-sm font-semibold transition-all hover:bg-[#FFF5EE]"
                    >
                      <span>{tag.name}</span>
                      <span className="text-xs text-[#E65A00]/80">
                        {tag.postCount || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTag(tag);
                          setName(tag.name);
                          setFeedback(null);
                        }}
                        className="opacity-70 group-hover:opacity-100 text-[#6B655C] hover:text-[#E65A00] transition-opacity ml-1 cursor-pointer"
                        title="编辑标签"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tag)}
                        className="opacity-0 group-hover:opacity-100 text-[#8C8375] hover:text-red-600 transition-opacity ml-0.5 cursor-pointer"
                        title="删除标签"
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title="确认删除该标签？"
          description={`删除标签「${deleteTarget?.name}」后，仅会解除与相关文章的关联，文章本身不会被删除。关联文章数：${deleteTarget?.postCount || 0} 篇。`}
          confirmText="确认删除"
          isDanger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </main>
    </div>
  );
}
