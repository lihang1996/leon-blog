"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCategoryDTO } from "@/modules/category";
import { Button } from "@/components/ui/button";
import { FormField, adminInputClass } from "@/components/admin/form-field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  mapCategoryFormError,
  type EntityApiError,
  type EntityFormErrors,
} from "@/components/admin/entity-form-errors";

/**
 * Category CRUD (PRD §6.4 / §7.5). Deleting keeps the posts but sets their
 * category to null — the confirm dialog surfaces the impact count first.
 */
export function CategoryManager({ initialCategories }: { initialCategories: AdminCategoryDTO[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [editing, setEditing] = useState<AdminCategoryDTO | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [errors, setErrors] = useState<EntityFormErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCategoryDTO | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterDeleteIdRef = useRef<string | null | undefined>(undefined);
  const activeOperationRef = useRef<symbol | null>(null);

  function beginOperation(action: "save" | "delete") {
    if (activeOperationRef.current) return null;
    const token = Symbol(action);
    activeOperationRef.current = token;
    setBusy(action);
    return token;
  }

  function finishOperation(token: symbol) {
    if (activeOperationRef.current !== token) return;
    activeOperationRef.current = null;
    setBusy(null);
  }

  const restoreFocusAfterDelete = useCallback(() => {
    const targetId = focusAfterDeleteIdRef.current;
    if (targetId === undefined) return null;
    focusAfterDeleteIdRef.current = undefined;
    return (targetId ? editButtonRefs.current.get(targetId) : null) ?? nameInputRef.current;
  }, []);

  useEffect(() => {
    if (deleteTarget !== null || focusAfterDeleteIdRef.current === undefined) return;
    const target = restoreFocusAfterDelete();
    if (target?.isConnected) target.focus();
  }, [categories, deleteTarget, restoreFocusAfterDelete]);

  async function refresh(excludeId?: string): Promise<boolean> {
    try {
      const res = await fetch("/api/v1/admin/categories");
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json?.data)) return false;
      setCategories(
        excludeId
          ? (json.data as AdminCategoryDTO[]).filter((category) => category.id !== excludeId)
          : (json.data as AdminCategoryDTO[]),
      );
      return true;
    } catch {
      return false;
    } finally {
      router.refresh();
    }
  }

  function startCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setDescription("");
    setSortOrder(0);
    setErrors({});
  }

  function startEdit(category: AdminCategoryDTO) {
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setDescription(category.description ?? "");
    setSortOrder(category.sortOrder);
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const operation = beginOperation("save");
    if (!operation) return;
    setErrors({});
    try {
      const body = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        sortOrder,
      };
      const res = editing
        ? await fetch(`/api/v1/admin/categories/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/v1/admin/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(mapCategoryFormError((json?.error as EntityApiError | undefined) ?? { message: "保存失败" }));
        return;
      }
      startCreate();
      const refreshed = await refresh();
      if (!refreshed) setErrors({ global: "保存成功，但列表同步失败，请刷新页面重试。" });
    } catch {
      setErrors({ global: "网络错误，请重试" });
    } finally {
      finishOperation(operation);
    }
  }

  async function remove() {
    const target = deleteTarget;
    if (!target) return;
    const operation = beginOperation("delete");
    if (!operation) return;
    try {
      const res = await fetch(`/api/v1/admin/categories/${target.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => null);
        setDeleteTarget(null);
        setErrors({ global: (json?.error?.message as string) ?? "删除失败" });
      } else {
        const deletedIndex = categories.findIndex((category) => category.id === target.id);
        focusAfterDeleteIdRef.current = categories[deletedIndex + 1]?.id ?? null;
        // The DELETE has committed. Remove the stale trigger immediately so a
        // failed follow-up GET cannot leave an actionable ghost row behind.
        setCategories((current) => current.filter((category) => category.id !== target.id));
        const refreshed = await refresh(target.id);
        if (!refreshed) {
          setErrors({ global: "删除已完成，但列表同步失败；当前列表已更新，可刷新页面重试。" });
        }
        setDeleteTarget(null);
      }
    } catch {
      focusAfterDeleteIdRef.current = undefined;
      setDeleteTarget(null);
      setErrors({ global: "网络错误，请重试" });
    } finally {
      finishOperation(operation);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Form */}
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface p-5 h-fit" noValidate>
        <h2 className="font-serif-cn text-lg font-bold text-text">{editing ? "编辑分类" : "新建分类"}</h2>
        <FormField label="名称" htmlFor="cat-name" error={errors.name}>
          <input
            ref={nameInputRef}
            id="cat-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={40}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "cat-name-error" : undefined}
            className={adminInputClass}
          />
        </FormField>
        <FormField label="Slug" htmlFor="cat-slug" hint="小写字母、数字与连字符" error={errors.slug}>
          <input
            id="cat-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
            maxLength={60}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={`cat-slug-hint${errors.slug ? " cat-slug-error" : ""}`}
            className={adminInputClass}
          />
        </FormField>
        <FormField label="说明" htmlFor="cat-desc" error={errors.description}>
          <textarea
            id="cat-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={200}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "cat-desc-error" : undefined}
            className={`${adminInputClass} h-auto py-2`}
          />
        </FormField>
        <FormField label="排序" htmlFor="cat-sort" hint="整数 0–1000，数值越小越靠前" error={errors.sortOrder}>
          <input
            id="cat-sort"
            type="number"
            min={0}
            max={1000}
            step={1}
            value={sortOrder}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setSortOrder(Number.isFinite(next) ? next : 0);
            }}
            required
            aria-invalid={errors.sortOrder ? true : undefined}
            aria-describedby={`cat-sort-hint${errors.sortOrder ? " cat-sort-error" : ""}`}
            className={adminInputClass}
          />
        </FormField>
        {errors.global ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {errors.global}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button type="submit" pending={busy === "save"} disabled={busy !== null}>
            {editing ? "保存修改" : "创建分类"}
          </Button>
          {editing ? (
            <Button type="button" variant="secondary" onClick={startCreate} disabled={busy !== null}>
              取消
            </Button>
          ) : null}
        </div>
      </form>

      {/* List */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">文章数</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.length > 0 ? (
              categories.map((category) => (
                <tr key={category.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-text">{category.name}</td>
                  <td className="px-4 py-3 font-mono text-text-muted">{category.slug}</td>
                  <td className="px-4 py-3 text-text-muted">{category.postCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-sm">
                      <button
                        ref={(element) => {
                          if (element) editButtonRefs.current.set(category.id, element);
                          else editButtonRefs.current.delete(category.id);
                        }}
                        type="button"
                        onClick={() => startEdit(category)}
                        disabled={busy !== null}
                        className="focus-link text-accent-text underline underline-offset-4 hover:text-accent"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(category)}
                        disabled={busy !== null}
                        className="focus-link-danger text-danger underline underline-offset-4 hover:text-danger/70"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                  还没有分类，在左侧创建一个。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除分类「${deleteTarget?.name ?? ""}」？`}
        description={`删除后该分类下 ${deleteTarget?.postCount ?? 0} 篇文章将变为无分类，文章本身不会被删除。`}
        confirmLabel="删除分类"
        danger
        pending={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
        restoreFocusTo={restoreFocusAfterDelete}
      />
    </div>
  );
}
