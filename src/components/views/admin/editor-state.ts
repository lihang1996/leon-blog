import type { AdminPostItem } from "@/lib/client-api";

export interface EditorDraft {
  title: string;
  slug: string;
  excerpt: string;
  contentMd: string;
  categoryId: string;
  tagIds: string[];
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string;
  seoImageUrl: string;
}

export function emptyEditorDraft(): EditorDraft {
  return {
    title: "", slug: "", excerpt: "", contentMd: "", categoryId: "", tagIds: [],
    seoTitle: "", seoDescription: "", coverImageUrl: "", seoImageUrl: "",
  };
}

export function draftFromPost(post: AdminPostItem): EditorDraft {
  return {
    title: post.title ?? "", slug: post.slug ?? "", excerpt: post.excerpt ?? "",
    contentMd: post.contentMd ?? "", categoryId: post.categoryId ?? "",
    tagIds: [...(post.tagIds ?? [])], seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "", coverImageUrl: post.coverImageUrl ?? "",
    seoImageUrl: post.seoImageUrl ?? "",
  };
}

export function serializeEditorSnapshot(draft: EditorDraft): string {
  return JSON.stringify({ ...draft, tagIds: [...draft.tagIds].sort() });
}

export function editorContent(draft: EditorDraft, publishedBefore: boolean) {
  return {
    title: draft.title.trim(), excerpt: draft.excerpt.trim(), contentMd: draft.contentMd.trim(),
    ...(!publishedBefore ? { slug: draft.slug.trim() || undefined } : {}),
    categoryId: draft.categoryId || null, tagIds: [...draft.tagIds],
    seoTitle: draft.seoTitle.trim() || null, seoDescription: draft.seoDescription.trim() || null,
    coverImageUrl: draft.coverImageUrl.trim() || null, seoImageUrl: draft.seoImageUrl.trim() || null,
  };
}

export interface MutationFailure {
  error: string | null;
  errorCode?: string | null;
  status?: number | null;
  requestId?: string | null;
  /** Server 422 `details` (zod paths / policy codes) — consumed by FR-07 mapping. */
  details?: unknown;
}

/**
 * Write-outcome classification (FR-02 / delivery §4.1):
 *
 * - "rejection" — the server EXPLICITLY refused the write (422 validation,
 *   unique-conflict 409, known 404, other definite 4xx). All input stays
 *   editable; the user can fix the field and resubmit.
 * - "conflict"   — optimistic-version conflicts (`*_CONCURRENT_MODIFICATION`,
 *   409). The local draft is kept and further writes are blocked until the
 *   user reconciles with the server copy.
 * - "auth"       — identity/permission failure (401/403, AUTH_*,
 *   ADMIN_DISABLED). A definite refusal: keep the draft, tell the user to
 *   re-check the session; never auto-navigate and lose input.
 * - "unknown"    — transport failure, 5xx, unparseable/incomplete success,
 *   or a 409 whose code is not a recognized conflict. The write may or may
 *   not have committed: keep the draft and the original baseline, mark for
 *   review, never auto-retry.
 *
 * Only "conflict" and "unknown" lock the editor ("needs review"); a plain
 * duplicate slug or a field error must not (FR-02.1–2). Codes that do not
 * exist on the server (e.g. `POST_VERSION_CONFLICT`) are deliberately NOT
 * referenced (FR-02.4).
 */
export type MutationOutcomeKind = "rejection" | "conflict" | "auth" | "unknown";

/** 409s the server issues for unique-field duplicates — definite rejections. */
const UNIQUE_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "POST_SLUG_EXISTS",
  "CATEGORY_NAME_EXISTS",
  "CATEGORY_SLUG_EXISTS",
  "TAG_NAME_EXISTS",
  "TAG_SLUG_EXISTS",
]);

/** Optimistic-version conflicts — must be reconciled by the user. */
const CONCURRENT_MODIFICATION_CODES: ReadonlySet<string> = new Set([
  "POST_CONCURRENT_MODIFICATION",
  "CATEGORY_CONCURRENT_MODIFICATION",
  "TAG_CONCURRENT_MODIFICATION",
]);

const AUTH_FAILURE_CODES: ReadonlySet<string> = new Set([
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "ADMIN_DISABLED",
]);

export function classifyMutationFailure(result: MutationFailure): MutationOutcomeKind {
  const status = result.status ?? 0;
  const code = result.errorCode ?? "";
  // No error text / no status can never prove the write did not commit.
  if (!result.error || !status || status >= 500) return "unknown";
  // A corrupt/unparseable success (delivery §4.1 "无法解析…的 2xx") says
  // nothing about whether the write committed — it stays unknown even though
  // the HTTP status looks like 2xx.
  if (code === "INVALID_RESPONSE") return "unknown";
  if (status === 409) {
    if (UNIQUE_CONFLICT_CODES.has(code)) return "rejection";
    if (CONCURRENT_MODIFICATION_CODES.has(code)) return "conflict";
    return "unknown";
  }
  if (status === 401 || status === 403 || AUTH_FAILURE_CODES.has(code)) return "auth";
  // 422 field errors, known 404s (vanished relations), 400, 413, …
  return "rejection";
}

export function mutationNeedsReview(result: MutationFailure): boolean {
  const kind = classifyMutationFailure(result);
  return kind === "conflict" || kind === "unknown";
}

/**
 * Client-side reading of the `X-Public-Cache-Status` header (delivery §4.2).
 * Only the three contract values are trusted; a missing or illegal value
 * means the public-cache state is UNKNOWN and must not be treated as a
 * successful refresh.
 */
export type PublicCacheEvaluation = "invalidated" | "not-required" | "failed" | "unknown";

export function evaluateCacheStatus(raw: string | null | undefined): PublicCacheEvaluation {
  if (raw === "invalidated" || raw === "failed" || raw === "not-required") return raw;
  return "unknown";
}

/**
 * Cache-refresh warning shown next to a CONFIRMED business write whose public
 * invalidation failed or is unknown (FR-03 / delivery §4.1 last row). The
 * business result (ID/version/status) is already adopted at this point; the
 * warning only asks the user to retry the refresh — never the write.
 */
export interface CacheNotice {
  kind: "failed" | "unknown";
  action: "save" | "publish" | "archive" | "restore" | "delete" | "tag";
}

export const CACHE_NOTICE_SUBJECT: Record<CacheNotice["action"], string> = {
  save: "文章已保存",
  publish: "文章已发布",
  archive: "文章已归档",
  restore: "文章已恢复为草稿",
  delete: "文章已删除",
  tag: "标签已创建",
};

/** Warning copy for a confirmed write whose refresh failed / is unknown. */
export function cacheRefreshWarningText(subject: string, kind: "failed" | "unknown"): string {
  const state = kind === "unknown" ? "公开缓存状态未知" : "公开内容刷新失败";
  return `${subject}，但${state}。公开页面可能暂时显示旧内容：请点击“重试公开内容刷新”并核对公开页面（此操作只刷新缓存，不会重复提交内容）。`;
}

export function cacheNoticeText(notice: CacheNotice): string {
  return cacheRefreshWarningText(CACHE_NOTICE_SUBJECT[notice.action], notice.kind);
}

/** A confirmed write only warns when the refresh failed or is unknown. */
export function cacheNoticeFromStatus(
  raw: string | undefined,
  action: CacheNotice["action"],
): CacheNotice | null {
  const evaluated = evaluateCacheStatus(raw);
  return evaluated === "failed" || evaluated === "unknown" ? { kind: evaluated, action } : null;
}

/**
 * One-shot sessionStorage handoff of a cache warning across the /new → /edit
 * address normalization (FR-03). The marker carries the TARGET ARTICLE ID so
 * a different editor instance can never consume somebody else's warning
 * (Codex review #3): only the /edit page of that exact article adopts it.
 */
export const CACHE_NOTICE_STORAGE_KEY = "leon-blog:editor-cache-notice";

export type StoredCacheNoticeParse =
  | { kind: "absent" } // nothing stored
  | { kind: "invalid" } // corrupt/unusable → caller may drop the marker
  | { kind: "mismatch" } // belongs to another article → caller MUST leave it
  | { kind: "match"; notice: CacheNotice }; // consume + show

export function parseStoredCacheNotice(raw: string | null, postId: string | null): StoredCacheNoticeParse {
  if (!raw) return { kind: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  if (typeof parsed !== "object" || parsed === null) return { kind: "invalid" };
  const candidate = parsed as { postId?: unknown; notice?: unknown };
  if (typeof candidate.postId !== "string" || typeof candidate.notice !== "object" || candidate.notice === null) {
    return { kind: "invalid" };
  }
  const notice = candidate.notice as { kind?: unknown; action?: unknown };
  if (
    (notice.kind !== "failed" && notice.kind !== "unknown") ||
    typeof notice.action !== "string" ||
    !(notice.action in CACHE_NOTICE_SUBJECT)
  ) {
    return { kind: "invalid" };
  }
  if (!postId || candidate.postId !== postId) return { kind: "mismatch" };
  return { kind: "match", notice: { kind: notice.kind, action: notice.action as CacheNotice["action"] } };
}

/**
 * FR-01 state machine for the /new → editing transition after a create
 * (Codex review round 2). Once the create is CONFIRMED, the writable editing
 * identity must live at /admin/posts/{id}/edit — never at /admin/posts/new
 * (AC-01-04). How the address moves depends on how the REST of the flow
 * settled:
 *
 * - definite SUCCESS (create-only or create+update) → soft navigation
 *   (router.replace): the page remounts and re-reads server truth.
 * - definite FAILURE on the update (rejection / version conflict) → the
 *   address is normalized with the native `window.history.replaceState`
 *   integration (no reload, NO unmount) so the adopted ID, version, local
 *   input, and the failure reason all survive on this instance; retrying can
 *   only PATCH. The editor stays writable after a plain rejection; a version
 *   conflict keeps the existing needsReview lock until the user reloads.
 * - AUTH failure or UNKNOWN outcome → the address is normalized the same
 *   way, but the instance enters a READ-ONLY recovery lock: the session may
 *   be dead (a fresh /edit GET could bounce to login) or the write may have
 *   committed, so NO further write to the adopted ID and no "new post" reuse
 *   may start from this state. Recovery = re-login, or reload server content
 *   (unknown case) once the session is valid again.
 */
export type CreateFlowOutcome =
  | "create-unconfirmed" // the create itself failed — no adopted ID
  | "created-only" // draft create confirmed; no update attempted
  | "update-succeeded"
  | "update-rejection" // definite 4xx (422 / 404 / unique-409 …)
  | "update-conflict" // 409 *_CONCURRENT_MODIFICATION
  | "update-auth" // 401 / 403 / AUTH_* / ADMIN_DISABLED
  | "update-unknown"; // transport / 5xx / corrupt 2xx / unrecognized 409

export interface EditorWriteLock {
  reason: "auth" | "unknown";
  postId: string;
}

export interface CreateFlowDisposition {
  /** Soft navigation that remounts and re-reads server state — success only. */
  softNavigateTo: string | null;
  /** Address normalization keeping this instance mounted (history.replaceState). */
  normalizeAddressTo: string | null;
  /** Read-only recovery lock forbidding any write to the adopted ID. */
  writeLock: EditorWriteLock | null;
}

export function createFlowDisposition(args: {
  adoptedId: string | null;
  outcome: CreateFlowOutcome;
}): CreateFlowDisposition {
  const id = args.adoptedId;
  if (!id || args.outcome === "create-unconfirmed") {
    // No confirmed create: the /new address is still the truth. Nothing to
    // normalize, nothing to lock — input preservation is handled by the
    // FR-02 classification (needsReview), not by identity rules.
    return { softNavigateTo: null, normalizeAddressTo: null, writeLock: null };
  }
  const editUrl = `/admin/posts/${id}/edit`;
  switch (args.outcome) {
    case "created-only":
    case "update-succeeded":
      return { softNavigateTo: editUrl, normalizeAddressTo: null, writeLock: null };
    case "update-rejection":
    case "update-conflict":
      return { softNavigateTo: null, normalizeAddressTo: editUrl, writeLock: null };
    case "update-auth":
    case "update-unknown":
      return {
        softNavigateTo: null,
        normalizeAddressTo: editUrl,
        writeLock: { reason: args.outcome === "update-auth" ? "auth" : "unknown", postId: id },
      };
  }
}

/** Maps a classified update failure to the flow outcome used above. */
export function createFlowOutcomeOf(kind: MutationOutcomeKind): CreateFlowOutcome {
  switch (kind) {
    case "rejection":
      return "update-rejection";
    case "conflict":
      return "update-conflict";
    case "auth":
      return "update-auth";
    default:
      return "update-unknown";
  }
}

/**
 * Single write gate for every editor mutation (save/publish/archive/restore/
 * delete/inline-tag). Tested here so the component cannot silently miss a
 * locking dimension: writes require idle state, no pending review, and no
 * active recovery lock.
 */
export function editorWriteAllowed(state: {
  busy: boolean;
  saving: boolean;
  loading: boolean;
  needsReview: boolean;
  recoveryLock: unknown;
}): boolean {
  return !state.busy && !state.saving && !state.loading && !state.needsReview && !state.recoveryLock;
}

export function mutationErrorMessage(result: MutationFailure): string {
  const message = result.error || "响应不完整，无法确认操作结果";
  const kind = classifyMutationFailure(result);
  let guidance = "";
  if (kind === "unknown") {
    guidance = " 结果尚未确认：当前输入已保留；请先核对服务器内容，不要重复提交。重新加载会要求确认丢弃当前输入。";
  } else if (kind === "conflict") {
    guidance = " 服务器内容已被修改：本地稿已保留且暂不能保存。请核对后重新加载服务器内容，再决定采用哪一版。";
  } else if (kind === "auth") {
    guidance = " 登录状态或权限已失效，内容并未保存。当前输入已保留，请重新登录后再保存，不要在此页面重复提交。";
  } else {
    guidance = " 请按提示修改后重新保存；输入已保留。";
  }
  return `${message}${guidance}${result.requestId ? `（请求 ID：${result.requestId}）` : ""}`;
}

/**
 * The user-facing hint for a failed inline tag creation. Unique-name/slug
 * conflicts are scoped to the tag input only — they must not freeze the
 * article editor (FR-02.3).
 */
export function inlineTagErrorMessage(result: MutationFailure): string {
  const kind = classifyMutationFailure(result);
  if (kind === "rejection") {
    return `${result.error || "标签创建被拒绝"}。请修改名称后重试，或直接从上方选择已有标签。`;
  }
  // Unknown outcomes still need the article-level review path.
  return mutationErrorMessage(result);
}
