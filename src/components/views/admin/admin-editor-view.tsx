"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "../../ui/header";
import { Button } from "../../ui/button";
import { StatusBadge } from "../../ui/badge";
import { Modal } from "../../ui/modal";
import { CatEditorWrite, CatPeek, PottedPlant, TitleBrushUnderline } from "../../ui/cat-doodles";
import { clientApi, type AdminCategoryItem, type AdminTagItem } from "@/lib/client-api";
import { slugifyLabel } from "@/lib/slug";
import { MarkdownContent } from "../../ui/markdown-content";
import {
  CACHE_NOTICE_STORAGE_KEY,
  cacheNoticeFromStatus,
  cacheNoticeText,
  classifyMutationFailure,
  createFlowDisposition,
  createFlowOutcomeOf,
  draftFromPost,
  editorContent,
  editorWriteAllowed,
  emptyEditorDraft,
  evaluateCacheStatus,
  inlineTagErrorMessage,
  mutationErrorMessage,
  mutationNeedsReview,
  parseStoredCacheNotice,
  serializeEditorSnapshot,
  type CacheNotice,
  type CreateFlowOutcome,
  type EditorDraft,
  type MutationFailure,
} from "./editor-state";
import { CacheRefreshWarning } from "./cache-refresh-warning";
import { useEditorLeaveGuard } from "./use-editor-leave-guard";
import {
  EDITOR_LIMITS,
  editorFieldInputId,
  firstErroredField,
  mapMutationFailureToFields,
  seoSectionNeedsExpand,
  validateEditorDraft,
  type EditorField,
  type FieldErrors,
} from "./editor-validation";
import { ensureAdminLeaveGuard, unregisterAdminLeaveGuard } from "./logout-guard";

export interface AdminEditorProps {
  postId?: string;
}

/**
 * Move this instance's address to /admin/posts/{id}/edit via the native
 * history integration. Returns whether the browser ACTUALLY ended up at the
 * edit URL — callers must fail closed (lock all writes) on `false`, because a
 * writable adopted ID left at /admin/posts/new violates AC-01-04
 * (Codex review round 3).
 */
function ensureEditAddress(postId: string): boolean {
  const target = `/admin/posts/${postId}/edit`;
  try {
    if (window.location.pathname !== target) {
      window.history.replaceState(null, "", target);
    }
    return window.location.pathname === target;
  } catch {
    return false;
  }
}

export function AdminEditorView({ postId }: AdminEditorProps) {
  // Identity changes reset every field; Activity replays for the same identity do not.
  const id = postId && postId !== "new" ? postId : undefined;
  return <EditorForm key={id ?? "new"} initialPostId={id} />;
}

/**
 * Read-only recovery banner for the recoveryLock state (Codex review rounds
 * 2+3). Exported for static-render tests: it must offer ONLY recovery paths —
 * never a write, never a silent "start a new post" that abandons the adopted
 * article ID.
 */
export function RecoveryLockPanel({
  reason,
  onReload,
  disabled,
  editHref,
}: {
  reason: "auth" | "unknown" | "address";
  onReload: () => void;
  disabled: boolean;
  editHref?: string;
}) {
  const message =
    reason === "auth"
      ? "登录状态已失效：文章创建成功，但后续保存未写入服务器。编辑已锁定，不会再向该文章发送任何写入；输入已保留，可先复制。请重新登录后回到本页重新加载内容。"
      : reason === "address"
        ? "编辑地址未能切换到该文章的编辑页（/admin/posts/new 不能承载已创建文章的写入身份）。为避免误写，编辑已锁定；输入与错误信息已保留，可先复制。请从下方进入正确的编辑页继续。"
        : "上次保存结果尚未确认：编辑已锁定，不会再向该文章发送任何写入，也不会自动重试。输入已保留，可先复制；请核对服务器内容后重新加载。";
  return (
    <div role="alert" className="p-3.5 rounded-2xl text-xs sm:text-sm font-semibold bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA] animate-fade-in space-y-2">
      <p>{message}</p>
      <div className="flex flex-wrap items-center gap-3">
        {reason === "unknown" && (
          <Button variant="outline" size="sm" onClick={onReload} disabled={disabled}>
            重新加载服务器内容
          </Button>
        )}
        {reason === "address" && editHref && (
          <Button href={editHref} variant="outline" size="sm">
            打开已保存的文章
          </Button>
        )}
        <Button href="/admin/login" variant="outline" size="sm">
          重新登录
        </Button>
        <Button href="/admin/posts" target="_blank" rel="noreferrer" variant="outline" size="sm">
          在新标签页核对文章列表
        </Button>
      </div>
    </div>
  );
}

/**
 * Locked post-delete screen (Codex review #2). Exported for static-render
 * tests: besides the fixed refresh retry and returning to the list, it must
 * contain no control that could write the deleted article.
 */
export function DeletedArticleScreen({
  serverIdentity,
  feedback,
  cacheNoticeMsg,
  onRetryRefresh,
  refreshing,
}: {
  serverIdentity: { title: string; slug: string } | null;
  feedback: { type: "success" | "error"; msg: string } | null;
  cacheNoticeMsg?: string;
  onRetryRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header admin activePath="/admin/posts" />
      <main className="page-container flex-1 py-16 space-y-6">
        <div className="paper-card p-6 space-y-5">
          <h1 className="text-xl font-extrabold font-serif text-[#1A1A1A]">文章已删除</h1>
          <p className="text-sm text-[#6B655C] leading-relaxed">
            服务器记录的文章「{serverIdentity?.title ?? "（标题未知）"}」（Slug：{serverIdentity?.slug ?? "未知"}）已永久删除，不可恢复。
            此页面已锁定：不能再对该文章执行任何写入操作。
          </p>
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs sm:text-sm font-semibold ${
                feedback.type === "success"
                  ? "bg-[#EBF4EC] text-[#2E7D32] border border-[#C8E6C9]"
                  : "bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA]"
              }`}
            >
              {feedback.msg}
            </div>
          )}
          {cacheNoticeMsg && (
            <CacheRefreshWarning message={cacheNoticeMsg} onRetry={onRetryRefresh} refreshing={refreshing} />
          )}
          <div>
            <Button href="/admin/posts" variant="outline" size="md">
              ← 返回文章列表
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function EditorForm({ initialPostId }: { initialPostId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
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
  // Tag-scoped errors stay next to the tag input; they never freeze the
  // article editor (FR-02.3).
  const [tagError, setTagError] = useState("");
  const [cacheNotice, setCacheNotice] = useState<CacheNotice | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  // Read-only recovery lock (Codex review rounds 2+3): after a CONFIRMED
  // create, an auth failure, an unknown update outcome, or a FAILED address
  // normalization locks every write to the adopted ID and any "new post"
  // reuse. Recovery = re-login, or (unknown case) reloading the server
  // content once the session is valid; the address variant offers the edit
  // page link as the way back to a writable identity.
  const [recoveryLock, setRecoveryLock] = useState<{ reason: "auth" | "unknown" | "address" } | null>(null);
  // Confirmed hard-delete (204) with a failed/unknown refresh: the editor is
  // locked into a post-delete screen — no writes may target the deleted ID
  // anymore; only the fixed refresh retry and returning to the list remain
  // (Codex review #2).
  const [deletedConfirmed, setDeletedConfirmed] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // 服务器记录的身份（删除确认必须引用它，而不是可能已被本地修改的标题）。
  const [serverIdentity, setServerIdentity] = useState<{ title: string; slug: string } | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  // FR-07: field-level Chinese errors + form-level summary lines.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formSummary, setFormSummary] = useState<string[]>([]);
  const initialized = useRef(!initialPostId);
  const lifecycle = useRef(0);
  const busy = useRef(false);
  // B02: WHO holds the busy gate — a business write ("write") or the cache
  // refresh ("refresh"). Losing the page while a WRITE is pending leaves the
  // result unconfirmed (needs review); losing it during a REFRESH only has a
  // retryable pending flag to release — the confirmed warning stays.
  const busyOwner = useRef<null | "write" | "refresh">(null);
  const currentSnapshot = serializeEditorSnapshot(draft);
  const dirty = currentSnapshot !== savedSnapshot;
  const historyGuardAvailable = useEditorLeaveGuard(dirty || saving || needsReview || !!newTagName);
  const disabled = saving || loading;
  // B02: business write affordances are locked while a cache refresh holds the
  // shared busy gate too — refresh and writes serialize on ONE owner of the
  // page's cache notice, so no late response can clear a newer result.
  const writeDisabled = disabled || refreshingCache;

  // FR-20: the header logout decision reuses the SAME leave-guard condition.
  useEffect(() => {
    ensureAdminLeaveGuard("admin-editor", {
      blocked: dirty || needsReview || !!newTagName,
      busy: saving || loading,
      subject: "文章编辑器",
    });
    return () => { unregisterAdminLeaveGuard("admin-editor"); };
  }, [dirty, needsReview, newTagName, saving, loading]);

  // Editing a field invalidates that field's stale error (FR-07.6).
  const clearFieldError = (field: EditorField) => {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  // FR-07.3: SEO-section errors force the section open WITHOUT a state write —
  // `seoOpen` is derived, so the inputs mount in the SAME commit that renders
  // the errors. The focus effect below then runs after that commit and the
  // first correctable field reliably exists (Codex review round 1: focusing
  // from a microtask before the re-render could hit a not-yet-mounted input).
  const seoOpen = showSeo || seoSectionNeedsExpand(fieldErrors);
  useEffect(() => {
    const first = firstErroredField(fieldErrors);
    if (!first) return;
    // Field names are camelCase, input ids hyphenated — the shared map keeps
    // this lookup correct for every SEO field (Codex round 1 found the focus
    // being skipped via a non-existent `editor-seoTitle` id).
    const inputId = editorFieldInputId(first);
    if (!inputId) return;
    const element = document.getElementById(inputId);
    if (element instanceof HTMLElement) element.focus();
  }, [fieldErrors]);

  useLayoutEffect(() => {
    lifecycle.current += 1;
    return () => {
      lifecycle.current += 1;
      if (busy.current) {
        busy.current = false;
        if (busyOwner.current === "refresh") {
          // B02 (Activity hide/unmount, cacheComponents keeps state): the
          // refresh response no longer owns this page. Release its pending
          // flag so a retained instance can retry on reveal; the unresolved
          // warning stays for the same reason.
          setRefreshingCache(false);
        } else {
          setSaving(false);
          setNeedsReview(true);
          setFeedback({ type: "error", msg: "操作期间离开了页面，结果尚未确认。输入已保留，请先核对服务器内容，不要重复提交。" });
        }
        busyOwner.current = null;
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

  // A cache warning raised on the /new instance just before the /edit
  // normalization must still be visible after the soft navigation (FR-03).
  // The stored marker carries the TARGET ARTICLE ID: this instance adopts it
  // only on an exact match. A mismatched marker is left in place for the
  // rightful editor page; only a corrupt marker is dropped (Codex review #3).
  useEffect(() => {
    let active = true;
    // Deferred like useEditorLeaveGuard's availability flag: avoids a
    // synchronous setState cascade inside the effect.
    queueMicrotask(() => {
      if (!active) return;
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(CACHE_NOTICE_STORAGE_KEY);
      } catch {
        return;
      }
      const parsed = parseStoredCacheNotice(raw, initialPostId ?? null);
      if (parsed.kind === "match") {
        setCacheNotice(parsed.notice);
      }
      if (parsed.kind === "match" || parsed.kind === "invalid") {
        try { sessionStorage.removeItem(CACHE_NOTICE_STORAGE_KEY); } catch { /* best-effort */ }
      }
    });
    return () => { active = false; };
  }, [initialPostId]);

  /**
   * Records the refresh warning for a CONFIRMED write. `invalidated` and
   * `not-required` need nothing; a missing/illegal header is UNKNOWN and must
   * not be treated as a successful refresh (delivery §4.2.2). Returns the
   * active notice so async flows can bridge it across navigations without
   * reading stale closure state.
   */
  const noteCacheStatus = (raw: string | undefined, action: CacheNotice["action"]): CacheNotice | null => {
    const notice = cacheNoticeFromStatus(raw, action);
    setCacheNotice(notice);
    return notice;
  };

  // Self-defense against any Activity/back-forward reveal that re-shows a
  // RETAINED new-page instance at /admin/posts/new while it holds an adopted
  // article ID (Codex review round 3): writes are only legal at that
  // article's edit URL. Outside an in-flight flow (busy), a visible /new
  // address + adopted ID either re-normalizes or fails closed.
  useEffect(() => {
    let active = true;
    // Deferred like the other client-only initializations: avoids a
    // synchronous setState cascade inside the effect.
    queueMicrotask(() => {
      if (!active || busy.current || saving) return;
      if (!postId || pathname !== "/admin/posts/new") return;
      if (!ensureEditAddress(postId)) {
        setRecoveryLock({ reason: "address" });
        setNeedsReview(true);
      }
    });
    return () => { active = false; };
  }, [pathname, postId, saving]);

  const applyLoadedPost = (post: NonNullable<Awaited<ReturnType<typeof clientApi.getAdminPost>>["data"]>) => {
    const loaded = draftFromPost(post);
    setDraft(loaded);
    setSavedSnapshot(serializeEditorSnapshot(loaded));
    setServerIdentity({ title: post.title, slug: post.slug });
    setVersion(post.version);
    setStatus(post.status);
    setIsPublishedBefore(post.status === "PUBLISHED" || !!post.publishedAt);
    setLoadFailed(false);
    setFieldErrors({});
    setFormSummary([]);
    // Adopting confirmed server content ends any recovery lock — the editor
    // becomes writable again on the fresh baseline — EXCEPT for an adopted
    // new-page instance whose address STILL cannot be normalized off
    // /admin/posts/new: that stays fail-closed (AC-01-04, Codex round 3).
    if (!initialPostId && !ensureEditAddress(post.id)) {
      setRecoveryLock({ reason: "address" });
      setNeedsReview(true);
    } else {
      setRecoveryLock(null);
      setNeedsReview(false);
    }
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
    // FR-07.2: definite rejections (and 413) carry their reasons to the exact
    // fields; flow-level outcomes (conflict/auth/unknown) stay form-level.
    if (classifyMutationFailure(res) === "rejection" || res.status === 413) {
      const mapped = mapMutationFailureToFields(res);
      setFieldErrors(mapped.fieldErrors);
      setFormSummary(mapped.summary);
    } else {
      setFieldErrors({});
      setFormSummary([]);
    }
  };

  /**
   * Blank the /new instance's identity (FR-01.4/6) after its article was
   * created and the address normalized, so a retained (Activity) instance can
   * never resurrect the old post's ID, version, or content on a later
   * "新建文章" visit. The server copy is untouched.
   */
  const resetNewIdentity = () => {
    setPostId(undefined);
    setVersion(null);
    setStatus("DRAFT");
    setIsPublishedBefore(false);
    setDraft(emptyEditorDraft());
    setSavedSnapshot(serializeEditorSnapshot(emptyEditorDraft()));
    setNeedsReview(false);
    setRecoveryLock(null);
    setFeedback(null);
    setTagError("");
    setNewTagName("");
    setServerIdentity(null);
  };

  const saveContent = async (publish = false) => {
    if (!editorWriteAllowed({ busy: busy.current, saving, loading, needsReview, recoveryLock })) return;
    // FR-07: client-side pre-check with the server's own limits — the server
    // remains the final validator; this only fails fast with field-level text.
    const clientErrors = validateEditorDraft(draft, { slugLocked: isPublishedBefore });
    if (Object.values(clientErrors).some(Boolean)) {
      setFieldErrors(clientErrors);
      setFormSummary([]);
      setFeedback({ type: "error", msg: "有字段未通过检查，已定位到具体输入，请修正后重试。" });
      return;
    }
    setFieldErrors({});
    setFormSummary([]);
    if (postId && version === null) return;
    const generation = lifecycle.current;
    const submittedSnapshot = currentSnapshot;
    const payload = editorContent(draft, isPublishedBefore);
    busyOwner.current = "write";
    busy.current = true;
    setSaving(true);
    setFeedback(null);
    // FR-01 / AC-01-03/04/05 (Codex review round 2): once the create is
    // CONFIRMED, the writable editing identity must live at
    // /admin/posts/{id}/edit — never at /admin/posts/new — no matter how the
    // rest of the flow settles. The disposition state machine decides HOW the
    // address moves so local state (adopted ID, version, input, failure
    // reason) is only ever sacrificed on definite success, where the fresh
    // /edit page re-reads server truth.
    let adoptedId: string | null = null;
    let flowOutcome: CreateFlowOutcome = "create-unconfirmed";
    let pendingNotice: CacheNotice | null = null;
    // A draft save on /new is create-only; publishing on /new (and every save
    // on /edit) additionally sends the update request.
    const createOnlyDraftSave = !postId && !publish;
    try {
      let id = postId;
      let nextVersion = version;
      if (!id) {
        const created = await clientApi.createPost(payload);
        if (generation !== lifecycle.current) return;
        if (created.error || !created.data?.id || typeof created.data.version !== "number") {
          // No confirmed ID: the /new address is still the truth — stay here
          // (input and classification per FR-02), nothing adopted.
          showMutationError(created);
          return;
        }
        id = created.data.id;
        nextVersion = created.data.version;
        // Keep the new identity immediately, even if the following update fails.
        setPostId(id);
        setVersion(nextVersion);
        setStatus(created.data.status);
        initialized.current = true;
        setSavedSnapshot(submittedSnapshot);
        adoptedId = id;
        // A DRAFT create cannot change public output, but the header is still
        // read: a missing/illegal value is surfaced, never silently success.
        pendingNotice = noteCacheStatus(created.cacheStatus, "save");
      }
      if (createOnlyDraftSave) {
        setFeedback({ type: "success", msg: "草稿创建成功！后续保存将更新同一篇文章。" });
        flowOutcome = "created-only";
      } else {
        const res = await clientApi.updatePost(
          id!,
          {
            content: payload, ...(publish ? { action: "publish" as const } : {}), version: nextVersion!,
          },
          // The response must prove what this flow expects: PUBLISHED for a
          // publish, or the editor's known pre-save status for a plain save.
          { expectedStatus: publish ? "PUBLISHED" : status },
        );
        if (generation !== lifecycle.current) return;
        if (res.error || !res.data || typeof res.data.version !== "number") {
          // The create DID commit. The failure kind decides between "stay
          // writable at the normalized /edit address" (definite rejection /
          // version conflict — fix and retry PATCHes) and the read-only
          // recovery lock (auth / unknown). Nothing is reset and nothing is
          // resent either way.
          showMutationError(res);
          flowOutcome = adoptedId ? createFlowOutcomeOf(classifyMutationFailure(res)) : "create-unconfirmed";
        } else {
          setVersion(res.data.version);
          setStatus(res.data.status);
          setIsPublishedBefore(res.data.status === "PUBLISHED" || !!res.data.publishedAt);
          setSavedSnapshot(submittedSnapshot);
          setFeedback({ type: "success", msg: publish ? "文章发布成功！" : "文章已保存！" });
          // The write is confirmed; the refresh result is reported separately.
          pendingNotice = noteCacheStatus(res.cacheStatus, publish ? "publish" : "save");
          flowOutcome = "update-succeeded";
        }
      }
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "网络异常，无法确认保存结果" });
      // Transport failure during the update after a confirmed create is an
      // UNKNOWN outcome; during the create itself nothing was adopted.
      flowOutcome = adoptedId ? "update-unknown" : "create-unconfirmed";
    } finally {
      if (generation === lifecycle.current) {
        busy.current = false;
        busyOwner.current = null;
        setSaving(false);
      }
    }
    if (generation !== lifecycle.current) return;
    const disposition = createFlowDisposition({ adoptedId, outcome: flowOutcome });
    if (disposition.softNavigateTo && adoptedId) {
      // Definite success: soft-navigate; the fresh /edit instance re-reads
      // server truth. Carry an unacknowledged cache warning across, bound to
      // THIS article so only its own /edit page can consume it.
      if (pendingNotice) {
        try {
          sessionStorage.setItem(CACHE_NOTICE_STORAGE_KEY, JSON.stringify({ postId: adoptedId, notice: pendingNotice }));
        } catch { /* best-effort */ }
      }
      resetNewIdentity();
      router.replace(disposition.softNavigateTo);
      return;
    }
    if (disposition.normalizeAddressTo && adoptedId) {
      // Definite failure with the instance kept: normalize the address via
      // the native history integration (documented Next.js App Router
      // behavior — no reload, no unmount, usePathname stays in sync), so
      // /admin/posts/new never carries the old article's write identity
      // while every bit of local state survives.
      const addressNormalized = ensureEditAddress(adoptedId);
      // FAIL CLOSED (Codex review round 3): if the address could NOT be moved
      // off /admin/posts/new — replaceState threw, or the location did not
      // actually change — all writes against the adopted ID stop here.
      // Swallowing the failure and staying writable would leave a /new URL
      // holding the old article's write identity (AC-01-04 violation).
      if (!addressNormalized || disposition.writeLock) {
        setRecoveryLock({ reason: !addressNormalized ? "address" : disposition.writeLock!.reason });
        setNeedsReview(true);
      }
    }
  };
  const handleSaveDraft = () => saveContent();
  const handlePublish = () => saveContent(true);

  const changeStatus = async (action: "archive" | "restore") => {
    if (!postId || version === null || !editorWriteAllowed({ busy: busy.current, saving, loading, needsReview, recoveryLock })) return;
    const generation = lifecycle.current;
    busyOwner.current = "write";
    busy.current = true;
    setShowArchiveConfirm(false);
    setSaving(true);
    try {
      const res = await clientApi.updatePost(
        postId,
        { action, version },
        // Status actions must land on their target state, never drift.
        { expectedStatus: action === "archive" ? "ARCHIVED" : "DRAFT" },
      );
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data || typeof res.data.version !== "number") showMutationError(res);
      else {
        setStatus(res.data.status);
        setVersion(res.data.version);
        // Status-only operations must never mark local content as saved.
        setFeedback({ type: "success", msg: action === "archive" ? "文章已归档，未保存的输入仍保留" : "文章已恢复为草稿" });
        // The archive/restore is confirmed; a refresh failure is a separate,
        // retryable warning with archive-specific wording (FR-03.5).
        noteCacheStatus(res.cacheStatus, action);
      }
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "网络异常，无法确认操作结果" });
    } finally {
      if (generation === lifecycle.current) { busy.current = false; busyOwner.current = null; setSaving(false); }
    }
  };
  const handleArchive = () => changeStatus("archive");
  const handleRestore = () => changeStatus("restore");

  /**
   * One click = exactly one refresh request (delivery §4.2.6). Retrying ONLY
   * re-invalidates the fixed public caches — it never repeats the save,
   * publish, archive, or delete. On success after a delete, we finish the
   * deferred navigation to the post list.
   *
   * B02: the refresh holds the SAME busy gate as business writes (with owner
   * "refresh"), so save/status/tag writes can never interleave inside one
   * generation — a late refresh response therefore cannot clear a NEWER
   * warning produced by a write that (visibly) started after it, and vice
   * versa. When ownership is lost (hide/unmount), the pending flag is
   * released by the layout-effect cleanup and the warning is kept.
   */
  const retryCacheRefresh = async () => {
    if (refreshingCache || busy.current || loading) return;
    const generation = lifecycle.current;
    const wasDelete = cacheNotice?.action === "delete";
    busyOwner.current = "refresh";
    busy.current = true;
    setRefreshingCache(true);
    try {
      const res = await clientApi.revalidatePublicCache();
      // B02: a response arriving after the page was left/re-initialized no
      // longer owns this result — never write UI state or navigate from it.
      if (generation !== lifecycle.current) return;
      if (res.error || res.data?.cacheStatus !== "invalidated") {
        // Keep the warning; the business write itself stays confirmed.
        setFeedback({ type: "error", msg: "公开内容刷新仍未成功，警告已保留，可稍后再次重试。" });
      } else {
        setCacheNotice(null);
        setFeedback({ type: "success", msg: "公开内容刷新成功，公开页面将在下次访问时更新。" });
        if (wasDelete) router.replace("/admin/posts");
      }
    } catch {
      if (generation !== lifecycle.current) return;
      setFeedback({ type: "error", msg: "公开内容刷新仍未成功，警告已保留，可稍后再次重试。" });
    } finally {
      if (generation === lifecycle.current) {
        busy.current = false;
        busyOwner.current = null;
        setRefreshingCache(false);
      }
    }
  };

  const handleDeleteArchived = async () => {
    if (!postId || !editorWriteAllowed({ busy: busy.current, saving, loading, needsReview, recoveryLock })) return;
    const generation = lifecycle.current;
    busyOwner.current = "write";
    busy.current = true;
    setShowDeleteConfirm(false);
    setSaving(true);
    try {
      const res = await clientApi.deletePost(postId, version ?? 0);
      // B02: a response arriving after the page was left/re-initialized no
      // longer owns this outcome — no UI writes, no navigation. Whether the
      // delete committed stays a "result to verify" for the fresh page: the
      // leave guard already warned the user, and reloading a deleted id 404s.
      if (generation !== lifecycle.current) return;
      if (res.error) {
        showMutationError(res);
        return;
      }
      // The delete committed (204). With a failed/unknown refresh we stay —
      // but in a locked post-delete state: the article ID no longer exists
      // server-side, so NO write (save/publish/restore/delete) may be issued
      // from this page anymore. Only the fixed refresh retry and returning to
      // the list remain (Codex review #2 / FR-03.8).
      const evaluated = evaluateCacheStatus(res.cacheStatus);
      if (evaluated === "failed" || evaluated === "unknown") {
        noteCacheStatus(res.cacheStatus, "delete");
        setSavedSnapshot(currentSnapshot); // nothing remains to "save" — the row is gone
        setNewTagName("");
        setNeedsReview(false);
        setDeletedConfirmed(true);
      } else {
        setCacheNotice(null);
        router.replace("/admin/posts");
      }
    } finally {
      if (generation === lifecycle.current) {
        busy.current = false;
        busyOwner.current = null;
        setSaving(false);
      }
    }
  };

  const toggleTag = (tagId: string) => {
    setTagError("");
    const selected = !selectedTagIds.includes(tagId);
    // FR-07.4: hitting the cap is blocked AT SELECTION TIME with a clear
    // message — never a generic submit-time error or silent truncation.
    if (selected && selectedTagIds.length >= EDITOR_LIMITS.tags) {
      setTagError(`一篇文章最多选择 ${EDITOR_LIMITS.tags} 个标签，请先取消一个再添加`);
      return;
    }
    setDraft((current) => ({
      ...current,
      tagIds: selected ? [...current.tagIds, tagId] : current.tagIds.filter((id) => id !== tagId),
    }));
    setFieldErrors((current) => (current.tagIds ? { ...current, tagIds: undefined } : current));
  };

  /**
   * FR-02.6: with an UNKNOWN create outcome (no ID), the user may explicitly
   * discard the draft and start a new one — after confirmation, and never via
   * a background re-submission. The server-side draft (if any) is NOT deleted.
   */
  const handleDiscardUnknownDraft = () => {
    if (busy.current || postId) return;
    if (!window.confirm("将丢弃当前输入并开始新文章。若刚才的提交已在服务器创建草稿，它不会被删除，可稍后在文章列表核对。确定丢弃当前输入吗？")) return;
    resetNewIdentity();
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim() || !editorWriteAllowed({ busy: busy.current, saving, loading, needsReview, recoveryLock })) return;
    const generation = lifecycle.current;
    busyOwner.current = "write";
    busy.current = true;
    setTagError("");
    setSaving(true);
    try {
      const res = await clientApi.createTag({ name: newTagName.trim(), slug: slugifyLabel(newTagName.trim(), "tag") });
      if (generation !== lifecycle.current) return;
      if (res.error || !res.data) {
        // A definite rejection (duplicate name/slug, invalid input) is scoped
        // to the tag input: the article stays editable, the typed name is
        // kept, and the user is pointed at existing tags (FR-02.3). Only
        // version conflicts / unknown outcomes escalate to article level.
        if (classifyMutationFailure(res) === "rejection") setTagError(inlineTagErrorMessage(res));
        else showMutationError(res);
        return;
      }
      const tag = res.data;
      setTags((current) => [...current, tag]);
      if (selectedTagIds.length >= EDITOR_LIMITS.tags) {
        setTagError(`一篇文章最多选择 ${EDITOR_LIMITS.tags} 个标签；标签已创建，请先取消一个再勾选`);
      } else {
        setDraft((current) => ({ ...current, tagIds: [...current.tagIds, tag.id] }));
      }
      setNewTagName("");
      setShowAddTag(false);
      // The tag write is confirmed; a failed/unknown PUBLIC refresh (tag
      // index/cloud/sitemap) is reported separately with its own retry
      // (Codex review #4) — a 2xx + failed header must not look like a fully
      // silent success.
      noteCacheStatus(res.cacheStatus, "tag");
    } catch {
      if (generation === lifecycle.current) showMutationError({ error: "无法确认标签创建结果" });
    } finally {
      if (generation === lifecycle.current) { busy.current = false; busyOwner.current = null; setSaving(false); }
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

  // Locked post-delete screen (Codex review #2): the article was confirmed
  // deleted but the public refresh failed/stayed unknown. No editor fields,
  // no bottom action bar, no write handler can run against the deleted ID —
  // only the fixed refresh retry and returning to the list are offered.
  if (deletedConfirmed) {
    return (
      <DeletedArticleScreen
        serverIdentity={serverIdentity}
        feedback={feedback}
        cacheNoticeMsg={cacheNotice ? cacheNoticeText(cacheNotice) : undefined}
        onRetryRefresh={retryCacheRefresh}
        refreshing={refreshingCache}
      />
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

        {/* FR-07: form-level error summary. Field-level texts live next to
            their inputs; anything the server said that belongs to no single
            field is listed here so it can never silently disappear. */}
        {feedback?.type === "error" && (Object.values(fieldErrors).some(Boolean) || formSummary.length > 0) && (
          <div role="alert" className="p-3.5 rounded-2xl text-xs sm:text-sm font-semibold bg-[#FFF5EE] text-[#E65A00] border border-[#FFCCAA] animate-fade-in space-y-1">
            <p>{feedback.msg}</p>
            {formSummary.map((line) => <p key={line}>· {line}</p>)}
            <p className="font-normal">已按字段定位具体原因；请修正后重试。服务器仍是最终校验方。</p>
          </div>
        )}

        {/* Cache-refresh warning: the write itself is confirmed; only the
            public-cache refresh needs a separate, safe retry (FR-03). */}
        {cacheNotice && (
          <CacheRefreshWarning
            message={cacheNoticeText(cacheNotice)}
            onRetry={retryCacheRefresh}
            refreshing={refreshingCache || saving}
            extraActions={
              cacheNotice.action === "delete" ? (
                <Button href="/admin/posts" variant="outline" size="sm">
                  返回文章列表
                </Button>
              ) : undefined
            }
          />
        )}

        {/* Read-only recovery lock after a confirmed create whose update hit
            an auth failure or an unknown outcome (Codex review round 2). */}
        {recoveryLock && (
          <RecoveryLockPanel
            reason={recoveryLock.reason}
            onReload={handleReload}
            disabled={disabled}
            editHref={postId ? `/admin/posts/${postId}/edit` : undefined}
          />
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B655C]" role="status">
          <span>{loading ? "正在重新加载…" : saving ? "正在保存…" : dirty ? "有未保存的修改" : "无未保存的修改"}</span>
          {postId && !recoveryLock && <Button variant="outline" size="sm" disabled={writeDisabled} onClick={handleReload}>重新加载服务器内容</Button>}
          {postId && !initialPostId && <Button href={`/admin/posts/${postId}/edit`} variant="outline" size="sm">打开已保存的文章</Button>}
          {needsReview && !postId && <Button href="/admin/posts" target="_blank" rel="noreferrer" variant="outline" size="sm">在新标签页核对文章列表</Button>}
          {needsReview && !postId && <Button variant="outline" size="sm" onClick={handleDiscardUnknownDraft}>丢弃输入并开始新稿</Button>}
          {needsReview && !recoveryLock && <span>请先复制需要保留的文字，再核对服务器内容；不会自动重试。</span>}
        </div>
        {!historyGuardAvailable && <p role="alert" className="text-xs text-[#E65A00]">此浏览器不支持安全的后退/前进保护。离开前请保存或复制正文，建议使用最新版浏览器。</p>}
        {optionsError && <p role="alert" className="text-xs text-[#E65A00]">分类或标签加载失败：{optionsError} <button type="button" disabled={disabled} onClick={() => setOptionsReload((value) => value + 1)}>重试</button></p>}

        {/* Disable every editable control during a write, an explicit reload,
            or the read-only recovery lock. */}
        <fieldset disabled={disabled || !!recoveryLock} aria-label="文章内容与设置" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-w-0">
          {/* Left Column: Title, Excerpt, Markdown Editor */}
          <div className="lg:col-span-8 space-y-6">
            {/* Title Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="editor-title" className="block text-sm font-bold text-[#1A1A1A]">
                  标题
                </label>
                <span className={`text-[11px] ${title.trim().length > EDITOR_LIMITS.title ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>
                  {title.trim().length}/{EDITOR_LIMITS.title}
                </span>
              </div>
              <input
                type="text"
                id="editor-title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
                aria-invalid={fieldErrors.title ? true : undefined}
                aria-describedby={fieldErrors.title ? "editor-title-error" : undefined}
                placeholder="如何写出优雅的代码"
                className={`w-full px-5 py-3 text-base font-bold rounded-2xl bg-white border text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:outline-none ${
                  fieldErrors.title ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                }`}
              />
              {fieldErrors.title && (
                <p id="editor-title-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.title}</p>
              )}
            </div>

            {/* Excerpt Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="editor-excerpt" className="block text-sm font-bold text-[#1A1A1A]">
                  摘要
                </label>
                <span className={`text-[11px] ${excerpt.trim().length > EDITOR_LIMITS.excerpt ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>
                  {excerpt.trim().length}/{EDITOR_LIMITS.excerpt}
                </span>
              </div>
              <textarea
                id="editor-excerpt"
                value={excerpt}
                onChange={(e) => { setExcerpt(e.target.value); clearFieldError("excerpt"); }}
                aria-invalid={fieldErrors.excerpt ? true : undefined}
                aria-describedby={fieldErrors.excerpt ? "editor-excerpt-error" : undefined}
                rows={3}
                placeholder="优雅的代码不仅仅是能运行，更是易读、易维护、易扩展..."
                className={`w-full px-5 py-3 text-xs sm:text-sm rounded-2xl bg-white border text-[#1A1A1A] placeholder-[#9E9589] shadow-xs focus:outline-none leading-relaxed ${
                  fieldErrors.excerpt ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                }`}
              />
              {fieldErrors.excerpt && (
                <p id="editor-excerpt-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.excerpt}</p>
              )}
            </div>

            {/* Content (Markdown) Header & Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="editor-content" className="block text-sm font-bold text-[#1A1A1A]">
                  正文 (Markdown)
                  <span className={`ml-2 text-[11px] font-normal ${contentMd.length > EDITOR_LIMITS.contentMd ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>
                    {contentMd.length}/{EDITOR_LIMITS.contentMd}
                  </span>
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
                    onChange={(e) => { setContentMd(e.target.value); clearFieldError("contentMd"); }}
                    aria-invalid={fieldErrors.contentMd ? true : undefined}
                    aria-describedby={fieldErrors.contentMd ? "editor-contentMd-error" : undefined}
                    onScroll={(e) => {
                      if (lineNumbersRef.current) {
                        lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
                      }
                    }}
                    rows={16}
                    className={`flex-1 p-4 bg-transparent text-[#E2E8F0] font-mono text-xs sm:text-sm leading-6 focus:outline-none resize-y ${
                      fieldErrors.contentMd ? "ring-2 ring-[#E65A00]" : ""
                    }`}
                    placeholder="输入 Markdown 正文内容..."
                  />
                </div>
              ) : (
                <div className="paper-card p-6 min-h-[380px] text-[#2E2822] space-y-4">
                  {contentMd.trim() ? <MarkdownContent content={contentMd} compact /> : <p className="text-sm text-[#8C8375]">正文预览会显示在这里。</p>}
                </div>
              )}
              {fieldErrors.contentMd && (
                <p id="editor-contentMd-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.contentMd}</p>
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
                  onChange={(e) => { setSlug(e.target.value); clearFieldError("slug"); }}
                  aria-invalid={fieldErrors.slug ? true : undefined}
                  aria-describedby={fieldErrors.slug ? "editor-slug-error" : undefined}
                  placeholder="how-to-write-elegant-code"
                  className={`w-full px-4 py-2.5 text-xs sm:text-sm rounded-full bg-[#FAF6F0]/70 border text-[#1A1A1A] placeholder-[#9E9589] focus:bg-white focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                    fieldErrors.slug ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                  }`}
                />
                <span className="text-[11px] text-[#8C8375]">
                  {isPublishedBefore ? "发布后不可修改" : "可自定义 URL 路径，留空将自动生成"}
                </span>
                {fieldErrors.slug && (
                  <p id="editor-slug-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.slug}</p>
                )}
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
                  <span className={`ml-2 text-[11px] font-normal ${selectedTagIds.length >= EDITOR_LIMITS.tags ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>
                    {selectedTagIds.length}/{EDITOR_LIMITS.tags}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((t) => {
                    const isSelected = selectedTagIds.includes(t.id);
                    const capReached = !isSelected && selectedTagIds.length >= EDITOR_LIMITS.tags;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTag(t.id)}
                        title={capReached ? `已达 ${EDITOR_LIMITS.tags} 个标签上限，先取消一个再选择` : undefined}
                        className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#E65A00] text-white border-[#E65A00]"
                            : "bg-transparent text-[#E65A00] border-[#E65A00] hover:bg-[#FFF5EE]"
                        } ${capReached ? "opacity-50" : ""}`}
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
                  <div className="pt-2 animate-fade-in space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label="新标签名"
                        value={newTagName}
                        onChange={(e) => {
                          setNewTagName(e.target.value);
                          setTagError("");
                        }}
                        placeholder="新标签名..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-full border border-[#D5C7B2] focus:border-[#E65A00] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNewTag}
                        disabled={writeDisabled}
                        className="px-3 py-1.5 text-xs font-bold rounded-full bg-[#E65A00] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        确定
                      </button>
                    </div>
                    {tagError && <p role="alert" className="text-[11px] text-[#E65A00]">{tagError}</p>}
                    {fieldErrors.tagIds && <p id="editor-tagIds-error" role="alert" className="text-[11px] text-[#E65A00]">{fieldErrors.tagIds}</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-[#F0E6D8] pt-4">
                <button
                  type="button"
                  onClick={() => setShowSeo(!seoOpen)}
                  className="w-full min-h-11 flex items-center justify-between text-sm font-bold text-[#1A1A1A]"
                  aria-expanded={seoOpen}
                >
                  <span>SEO 设置{seoSectionNeedsExpand(fieldErrors) && !showSeo ? "（有未处理的错误，已自动展开）" : ""}</span>
                  <span className="text-[#E65A00]">{seoOpen ? "−" : "+"}</span>
                </button>
                {seoOpen && (
                  <div className="space-y-4 pt-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <label htmlFor="editor-seo-title" className="block text-xs font-bold text-[#1A1A1A]">SEO 标题</label>
                      {/* maxLength removed (FR-07.5): pasted over-limit text must
                          surface as a visible error, never a silent truncation. */}
                      <input
                        type="text"
                        id="editor-seo-title"
                        value={seoTitle}
                        onChange={(event) => { setSeoTitle(event.target.value); clearFieldError("seoTitle"); }}
                        aria-invalid={fieldErrors.seoTitle ? true : undefined}
                        aria-describedby={fieldErrors.seoTitle ? "editor-seoTitle-error" : undefined}
                        placeholder="留空则使用文章标题"
                        className={`w-full px-4 py-2.5 text-xs rounded-2xl bg-white border focus:outline-none ${
                          fieldErrors.seoTitle ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                        }`}
                      />
                      <p className={`text-[11px] text-right ${seoTitle.trim().length > EDITOR_LIMITS.seoTitle ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>{seoTitle.trim().length}/{EDITOR_LIMITS.seoTitle}</p>
                      {fieldErrors.seoTitle && (
                        <p id="editor-seoTitle-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.seoTitle}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-seo-description" className="block text-xs font-bold text-[#1A1A1A]">SEO 描述</label>
                      <textarea
                        rows={3}
                        id="editor-seo-description"
                        value={seoDescription}
                        onChange={(event) => { setSeoDescription(event.target.value); clearFieldError("seoDescription"); }}
                        aria-invalid={fieldErrors.seoDescription ? true : undefined}
                        aria-describedby={fieldErrors.seoDescription ? "editor-seoDescription-error" : undefined}
                        placeholder="留空则使用文章摘要"
                        className={`w-full px-4 py-2.5 text-xs rounded-2xl bg-white border focus:outline-none resize-none ${
                          fieldErrors.seoDescription ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                        }`}
                      />
                      <p className={`text-[11px] text-right ${seoDescription.trim().length > EDITOR_LIMITS.seoDescription ? "text-[#E65A00] font-bold" : "text-[#8C8375]"}`}>{seoDescription.trim().length}/{EDITOR_LIMITS.seoDescription}</p>
                      {fieldErrors.seoDescription && (
                        <p id="editor-seoDescription-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.seoDescription}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-cover-url" className="block text-xs font-bold text-[#1A1A1A]">封面图片 URL</label>
                      <input
                        type="url"
                        id="editor-cover-url"
                        value={coverImageUrl}
                        onChange={(event) => { setCoverImageUrl(event.target.value); clearFieldError("coverImageUrl"); }}
                        aria-invalid={fieldErrors.coverImageUrl ? true : undefined}
                        aria-describedby={fieldErrors.coverImageUrl ? "editor-coverImageUrl-error" : undefined}
                        placeholder="站内路径或白名单 HTTPS 地址"
                        className={`w-full px-4 py-2.5 text-xs rounded-2xl bg-white border focus:outline-none ${
                          fieldErrors.coverImageUrl ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                        }`}
                      />
                      {fieldErrors.coverImageUrl && (
                        <p id="editor-coverImageUrl-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.coverImageUrl}</p>
                      )}
                      <p className="text-[11px] text-[#8C8375]">发布时服务器将校验白名单；上限 2048 个字符。</p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="editor-share-url" className="block text-xs font-bold text-[#1A1A1A]">分享图片 URL</label>
                      <input
                        type="url"
                        id="editor-share-url"
                        value={seoImageUrl}
                        onChange={(event) => { setSeoImageUrl(event.target.value); clearFieldError("seoImageUrl"); }}
                        aria-invalid={fieldErrors.seoImageUrl ? true : undefined}
                        aria-describedby={fieldErrors.seoImageUrl ? "editor-seoImageUrl-error" : undefined}
                        placeholder="留空则使用封面图"
                        className={`w-full px-4 py-2.5 text-xs rounded-2xl bg-white border focus:outline-none ${
                          fieldErrors.seoImageUrl ? "border-[#E65A00]" : "border-[#D5C7B2] focus:border-[#E65A00]"
                        }`}
                      />
                      {fieldErrors.seoImageUrl && (
                        <p id="editor-seoImageUrl-error" role="alert" className="text-xs font-semibold text-[#E65A00]">{fieldErrors.seoImageUrl}</p>
                      )}
                      <p className="text-[11px] text-[#8C8375]">发布时服务器将校验白名单；上限 2048 个字符。</p>
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
          <Button onClick={handleSaveDraft} disabled={writeDisabled || needsReview} size="md">
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
            <Button onClick={handlePublish} disabled={writeDisabled || needsReview} size="md">
              发布
            </Button>
          )}
          {isEdit && status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              disabled={writeDisabled || needsReview}
              className="px-2 py-2 text-xs font-semibold text-[#8C8375] hover:text-[#1A1A1A] transition-colors cursor-pointer"
            >
              归档
            </button>
          )}
          {isEdit && status === "ARCHIVED" && (
            <>
              <Button onClick={handleRestore} disabled={writeDisabled || needsReview} size="md">
                恢复为草稿
              </Button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={writeDisabled || needsReview}
                className="px-2 py-2 text-xs font-semibold text-[#8C8375] hover:text-[#9E2F26] transition-colors cursor-pointer"
              >
                删除文章
              </button>
            </>
          )}
        </div>
      </div>
      <Modal
        isOpen={showArchiveConfirm}
        title="确认归档文章？"
        description="归档后文章将从访客端下线，但内容会保留在后台，可随时恢复。未保存的正文修改不会随归档写入。"
        confirmText="确认归档"
        confirmPending={saving || refreshingCache}
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
      <Modal
        isOpen={showDeleteConfirm}
        title="确认删除已归档文章？"
        description={`即将永久删除服务器记录的文章「${serverIdentity?.title ?? "（标题加载失败）"}」（Slug：${serverIdentity?.slug ?? "未知"}），正文不可恢复。此操作不可撤销。${dirty || needsReview ? "注意：当前有未保存的输入，将随删除一并丢失。" : ""}`}
        confirmText="确认删除"
        isDanger
        confirmPending={saving || refreshingCache}
        onConfirm={handleDeleteArchived}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
