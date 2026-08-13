"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTagDTO } from "@/modules/tag";
import { Button } from "@/components/ui/button";
import { FormField, adminInputClass } from "@/components/admin/form-field";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  mapTagFormError,
  type EntityApiError,
  type EntityFormErrors,
} from "@/components/admin/entity-form-errors";

/**
 * Tag CRUD (PRD §6.5 / §7.5). Deleting a tag only removes the post↔tag links —
 * posts are never deleted.
 */
export function TagManager({ initialTags }: { initialTags: AdminTagDTO[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [editing, setEditing] = useState<AdminTagDTO | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [errors, setErrors] = useState<EntityFormErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTagDTO | null>(null);
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
  }, [deleteTarget, restoreFocusAfterDelete, tags]);

  async function refresh(excludeId?: string): Promise<boolean> {
    try {
      const res = await fetch("/api/v1/admin/tags");
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json?.data)) return false;
      setTags(
        excludeId ? (json.data as AdminTagDTO[]).filter((tag) => tag.id !== excludeId) : (json.data as AdminTagDTO[]),
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
    setErrors({});
  }

  function startEdit(tag: AdminTagDTO) {
    setEditing(tag);
    setName(tag.name);
    setSlug(tag.slug);
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const operation = beginOperation("save");
    if (!operation) return;
    setErrors({});
    try {
      const body = { name: name.trim(), slug: slug.trim() };
      const res = editing
        ? await fetch(`/api/v1/admin/tags/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/v1/admin/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(mapTagFormError((json?.error as EntityApiError | undefined) ?? { message: "保存失败" }));
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
      const res = await fetch(`/api/v1/admin/tags/${target.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => null);
        setDeleteTarget(null);
        setErrors({ global: (json?.error?.message as string) ?? "删除失败" });
      } else {
        const deletedIndex = tags.findIndex((tag) => tag.id === target.id);
        focusAfterDeleteIdRef.current = tags[deletedIndex + 1]?.id ?? null;
        // Preserve the committed deletion locally even when the synchronizing
        // list request is unavailable or returns an invalid envelope.
        setTags((current) => current.filter((tag) => tag.id !== target.id));
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
      <form onSubmit={submit} className="h-fit space-y-4 rounded-lg border border-border bg-surface p-5" noValidate>
        <h2 className="font-serif-cn text-lg font-bold text-text">{editing ? "编辑标签" : "新建标签"}</h2>
        <FormField label="名称" htmlFor="tag-name" error={errors.name}>
          <input
            ref={nameInputRef}
            id="tag-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={30}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "tag-name-error" : undefined}
            className={adminInputClass}
          />
        </FormField>
        <FormField label="Slug" htmlFor="tag-slug" hint="小写字母、数字与连字符" error={errors.slug}>
          <input
            id="tag-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
            maxLength={50}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={`tag-slug-hint${errors.slug ? " tag-slug-error" : ""}`}
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
            {editing ? "保存修改" : "创建标签"}
          </Button>
          {editing ? (
            <Button type="button" variant="secondary" onClick={startCreate} disabled={busy !== null}>
              取消
            </Button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">关联文章</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {tags.length > 0 ? (
              tags.map((tag) => (
                <tr key={tag.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-text">#{tag.name}</td>
                  <td className="px-4 py-3 font-mono text-text-muted">{tag.slug}</td>
                  <td className="px-4 py-3 text-text-muted">{tag.postCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-sm">
                      <button
                        ref={(element) => {
                          if (element) editButtonRefs.current.set(tag.id, element);
                          else editButtonRefs.current.delete(tag.id);
                        }}
                        type="button"
                        onClick={() => startEdit(tag)}
                        disabled={busy !== null}
                        className="focus-link text-accent-text underline underline-offset-4 hover:text-accent"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tag)}
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
                  还没有标签，在左侧创建一个。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除标签「${deleteTarget?.name ?? ""}」？`}
        description={`删除后 ${deleteTarget?.postCount ?? 0} 篇文章与该标签的关联将被移除，文章本身不会被删除。`}
        confirmLabel="删除标签"
        danger
        pending={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
        restoreFocusTo={restoreFocusAfterDelete}
      />
    </div>
  );
}
