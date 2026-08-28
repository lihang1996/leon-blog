"use client";

import React, { useEffect, useState } from "react";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { Modal } from "../../ui/modal";
import { CatCategoryAdmin, CategoryIcon, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, CategoryItem } from "@/lib/client-api";

const AVAILABLE_ICONS = ["dev", "bulb", "design", "tool", "plane", "heart", "coffee", "leaf"];

export function AdminCategoriesView() {
  const [categories, setCategories] = useState<(CategoryItem & { iconKey?: string })[]>([]);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("dev");
  const [sortOrder, setSortOrder] = useState(1);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);

  const fetchCategories = async () => {
    const res = await clientApi.getAdminCategories();
      if (res.data) {
        setCategories(
          res.data.map((c, i) => ({
            ...c,
            iconKey: c.icon || AVAILABLE_ICONS[i % AVAILABLE_ICONS.length],
          }))
        );
      }
  };

  useEffect(() => {
    let active = true;
    void clientApi.getAdminCategories().then((res) => {
      if (active && res.data) {
        setCategories(
          res.data.map((category, index) => ({
            ...category,
            iconKey: category.icon || AVAILABLE_ICONS[index % AVAILABLE_ICONS.length],
          }))
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleEdit = (cat: CategoryItem & { iconKey?: string }) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || "");
    setSelectedIcon(cat.iconKey || "dev");
    setSortOrder(cat.sortOrder || 1);
    setFeedback(null);
  };

  const handleResetForm = () => {
    setEditingCategory(null);
    setName("");
    setSlug("");
    setDescription("");
    setSelectedIcon("dev");
    setSortOrder(categories.length + 1);
    setFeedback(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSaving(true);
    setFeedback(null);

    try {
      if (editingCategory) {
        const res = await clientApi.updateCategory(editingCategory.id, {
          name: name.trim(),
          slug: autoSlug,
          description: description.trim() || null,
          icon: selectedIcon,
          sortOrder,
        });
        if (res.error) setFeedback({ type: "error", msg: res.error });
        else {
          setFeedback({ type: "success", msg: "分类更新成功！" });
          fetchCategories();
          handleResetForm();
        }
      } else {
        const res = await clientApi.createCategory({
          name: name.trim(),
          slug: autoSlug,
          description: description.trim() || null,
          icon: selectedIcon,
          sortOrder: sortOrder || categories.length + 1,
        });
        if (res.error) setFeedback({ type: "error", msg: res.error });
        else {
          setFeedback({ type: "success", msg: "分类创建成功！" });
          fetchCategories();
          handleResetForm();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const res = await clientApi.deleteCategory(target.id);
    if (res.error) {
      setFeedback({ type: "error", msg: `删除失败：${res.error}` });
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    setCategories((prev) => prev.filter((c) => c.id !== target.id));
    setFeedback({ type: "success", msg: `已删除分类「${target.name}」，其下 ${target.postCount || 0} 篇文章变为未分类` });
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-[#FDFBF7]">
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

        {/* 2-Column Layout: Add/Edit Form (Left 5) + Category List (Right 7) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                    onClick={handleResetForm}
                    className="text-xs text-[#8C8375] hover:text-[#E65A00]"
                  >
                    取消编辑
                  </button>
                )}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  分类名称
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：开发笔记"
                  required
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="development-notes"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none"
                />
                <p className="text-[11px] text-[#8C8375]">留空时根据名称自动生成，仅支持小写字母、数字和连字符。</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  分类描述（可选）
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="简要描述该分类的内容或用途"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-2xl bg-white border border-[#D5C7B2] text-[#1A1A1A] placeholder-[#9E9589] focus:border-[#E65A00] focus:outline-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#1A1A1A]">
                  排序
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
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
                  disabled={saving}
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
                {categories.map((c) => (
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
                共 {categories.length} 个分类
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteTarget}
          title="确认删除该分类？"
          description={`删除分类「${deleteTarget?.name}」后，原属于该分类的文章不会被删除，仅会被解除分类关联（变为未分类）。关联文章数：${deleteTarget?.postCount || 0} 篇。`}
          confirmText="确认删除"
          isDanger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </main>
    </div>
  );
}
