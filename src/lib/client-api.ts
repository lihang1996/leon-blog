/**
 * Client-side API request helper for Leon Blog.
 * Provides typed methods for interacting with public and admin REST endpoints.
 */

export interface PostItem {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd?: string;
  coverImageUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageUrl?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  categoryId?: string | null;
  tagIds?: string[];
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  } | null;
  postTags?: {
    tagId?: string;
    tag: {
      id?: string;
      name: string;
      slug: string;
    };
  }[];
  tags?: TagItem[];
}

export interface AdminPostItem extends PostItem {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

type PostPayload = Partial<PostItem> & {
  categoryName?: string | null;
  tags?: TagItem[];
  postTags?: Array<{ tag?: TagItem } | TagItem>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface CategoryItem {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminCategoryItem extends CategoryItem {
  id: string;
  version: number;
}

export interface TagItem {
  id?: string;
  name: string;
  slug: string;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminTagItem extends TagItem {
  id: string;
  version: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data?: T;
  pagination?: PaginationMeta;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiResult<T> {
  data: T | null;
  meta?: PaginationMeta;
  error: string | null;
  status: number;
  errorCode?: string;
  details?: unknown;
  requestId?: string;
  /**
   * Raw `X-Public-Cache-Status` response header of admin writes:
   * "invalidated" | "failed" | "not-required" (FR-03 / delivery §4.2).
   * Missing/other values mean the public-cache state is UNKNOWN — callers
   * must not treat them as a successful refresh.
   */
  cacheStatus?: string;
}

/**
 * True when a request failed because the session/permission is gone (401 /
 * AUTH_REQUIRED / AUTH_INVALID, or the account was disabled). Views must NOT
 * keep showing previously-loaded admin data in this case — stale statistics
 * and post rows must be masked with an explicit identity prompt. Network-ish
 * failures may keep old data with a "可能不是最新" marker; auth failures may not.
 */
export function isAuthFailure(result: { status?: number; errorCode?: string | null }): boolean {
  if (result.status === 401 || result.status === 403) return true;
  return (
    result.errorCode === "AUTH_REQUIRED" ||
    result.errorCode === "AUTH_INVALID" ||
    result.errorCode === "ADMIN_DISABLED"
  );
}

export function normalizePostItem(item: unknown): PostItem {
  if (!isRecord(item)) {
    throw new TypeError("Post payload must be an object");
  }

  const post = item as PostPayload;
  const tags: TagItem[] = Array.isArray(post.tags)
    ? post.tags
    : Array.isArray(post.postTags)
    ? post.postTags
        .map((postTag) => ("tag" in postTag ? postTag.tag : postTag))
        .filter(Boolean) as TagItem[]
    : [];

  const postTags = tags.map((t) => ({ tag: t }));

  let category = post.category;
  if (!category && (post.categoryName || post.categoryId)) {
    category = {
      id: post.categoryId || "",
      name: post.categoryName || "未分类",
      slug: "",
    };
  }

  return {
    ...(post as PostItem),
    category,
    tags,
    postTags,
  };
}

export function getPostTags(post?: PostItem | null): TagItem[] {
  if (!post) return [];
  if (Array.isArray(post.tags) && post.tags.length > 0) return post.tags;
  if (Array.isArray(post.postTags) && post.postTags.length > 0) {
    return post.postTags.map((pt) => pt.tag).filter(Boolean);
  }
  return [];
}

async function request<T>(url: string, options?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    const headers = new Headers(options?.headers);
    if (options?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    res = await fetch(url, { ...options, headers, cache: "no-store" });
  } catch {
    return { data: null, error: "网络请求失败，请检查连接后重试", status: 0, errorCode: "NETWORK_ERROR" };
  }

  const requestId = res.headers.get("x-request-id") ?? undefined;
  const cacheStatus = res.headers.get("x-public-cache-status") ?? undefined;
  if (res.status === 204) return { data: null, error: null, status: res.status, requestId, cacheStatus };

  let json: ApiResponse<T>;
  try {
    const parsed: unknown = await res.json();
    if (!isRecord(parsed)) throw new TypeError("Invalid response");
    json = parsed as ApiResponse<T>;
  } catch {
    return {
      data: null,
      error: res.ok ? "服务器返回了无法识别的数据" : `请求失败 (${res.status})`,
      status: res.status,
      errorCode: res.ok ? "INVALID_RESPONSE" : "HTTP_ERROR",
      requestId,
    };
  }

  // Navigation here would discard unsaved forms before they can handle an expired session.
  if (!res.ok) {
    return {
      data: null,
      error: json.error?.message || `请求失败 (${res.status})`,
      status: res.status,
      errorCode: json.error?.code ?? "HTTP_ERROR",
      details: json.error?.details,
      requestId: json.error?.requestId ?? requestId,
    };
  }

  // A 2xx envelope carrying BOTH data and error is contradictory: it proves
  // neither success nor a definite 4xx rejection (delivery §4.1 "无法解析或
  // 缺少必需字段的 2xx"). It must surface as INVALID_RESPONSE → unknown —
  // never as a successful write, and never as a confirmed rejection either.
  if (json.error) {
    return { data: null, error: "服务器返回了无法识别的数据", status: res.status, errorCode: "INVALID_RESPONSE", requestId, cacheStatus };
  }

  let rawData: unknown = json.data;
  if (rawData === undefined) {
    return { data: null, error: "服务器返回了无法识别的数据", status: res.status, errorCode: "INVALID_RESPONSE", requestId, cacheStatus };
  }
  if (Array.isArray(rawData)) {
    rawData = rawData.map((item) =>
      isRecord(item) && ("title" in item || "contentMd" in item || "status" in item)
        ? normalizePostItem(item)
        : item,
    );
  } else if (isRecord(rawData) && ("title" in rawData || "contentMd" in rawData || "status" in rawData)) {
    rawData = normalizePostItem(rawData);
  }
  return { data: rawData as T, meta: json.pagination, error: null, status: res.status, requestId, cacheStatus };
}

/**
 * Runtime proof that an admin POST-WRITE response actually satisfies the
 * published contract (delivery §4.1 "缺少必需字段的 2xx" = UNKNOWN outcome;
 * Codex round-4 review tightened the checks):
 *
 * 1. Shape — every REQUIRED `AdminPostDTO` field present with the right type
 *    (id, title/slug/excerpt/contentMd strings — draft text may be empty but
 *    must exist —, nullable string fields, string[] tagIds, ISO createdAt /
 *    updatedAt, status enum, version). The optional nested `category` /
 *    `tags` refs are not demanded.
 * 2. Identity — on updates the id must equal the object actually written.
 * 3. Action target — publish→PUBLISHED, archive→ARCHIVED, restore→DRAFT;
 *    a 2xx that did not reach the requested state is unknown, never success.
 * 4. Version progression — the server bumps +1 per PATCH (repository
 *    `updateInTransaction`) and creates at version 0, so the response version
 *    is checked against request.version + 1 (updates) / 0 (create). If the
 *    contract ever changes, update this proof AND its tests together.
 * 5. Status code — create is 201; ONLY a bodyless 204 proves a hard delete.
 *
 * A parseable but non-conforming 2xx must never reach the views as success:
 * it is rewritten to INVALID_RESPONSE (→ FR-02 "unknown": draft and baseline
 * kept, editor locked for review, no success UI, no navigation, no replay).
 */
const ADMIN_POST_STATUSES: readonly string[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/** The status a conforming response must carry for each status action. */
export const ACTION_TARGET_STATUS = {
  publish: "PUBLISHED",
  archive: "ARCHIVED",
  restore: "DRAFT",
} as const;

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/** Every REQUIRED AdminPostDTO field exists with the correct type. */
function adminPostDtoShapeValid(data: Record<string, unknown>): boolean {
  if (typeof data.title !== "string" || typeof data.slug !== "string") return false;
  if (typeof data.excerpt !== "string" || typeof data.contentMd !== "string") return false;
  if (typeof data.createdAt !== "string" || typeof data.updatedAt !== "string") return false;
  if (!isNullableString(data.coverImageUrl)) return false;
  if (!isNullableString(data.seoTitle) || !isNullableString(data.seoDescription)) return false;
  if (!isNullableString(data.seoImageUrl) || !isNullableString(data.categoryId)) return false;
  if (!isNullableString(data.publishedAt)) return false;
  if (!Array.isArray(data.tagIds) || !data.tagIds.every((tagId) => typeof tagId === "string")) return false;
  return true;
}

function adminPostWriteResponseValid(
  data: unknown,
  expectation: {
    expectedId?: string;
    expectedStatus?: string;
    expectedVersion?: number;
  },
): boolean {
  if (!isRecord(data)) return false;
  const id = data.id;
  const status = data.status;
  const version = data.version;
  if (typeof id !== "string" || id.length === 0) return false;
  if (expectation.expectedId !== undefined && id !== expectation.expectedId) return false;
  if (typeof status !== "string" || !ADMIN_POST_STATUSES.includes(status)) return false;
  if (expectation.expectedStatus !== undefined && status !== expectation.expectedStatus) return false;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || version > 2147483647) return false;
  if (expectation.expectedVersion !== undefined && version !== expectation.expectedVersion) return false;
  return adminPostDtoShapeValid(data);
}

/** Rewrites a corrupt 2xx into the INVALID_RESPONSE unknown-outcome shape. */
function invalidPostWriteResponse<T>(res: ApiResult<T>): ApiResult<T> {
  return {
    data: null,
    error: "服务器返回了无法识别的数据",
    status: res.status,
    errorCode: "INVALID_RESPONSE",
    requestId: res.requestId,
  };
}

export const clientApi = {
  // Public APIs
  async getPosts(params?: {
    page?: number;
    pageSize?: number;
    category?: string;
    tag?: string;
    query?: string;
    sort?: "latest" | "updated";
  }) {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.category) q.set("category", params.category);
    if (params?.tag) q.set("tag", params.tag);
    if (params?.query) q.set("q", params.query);
    if (params?.sort) q.set("sort", params.sort);
    const qs = q.toString();
    return request<PostItem[]>(`/api/v1/posts${qs ? `?${qs}` : ""}`);
  },

  async getPostBySlug(slug: string) {
    return request<PostItem>(`/api/v1/posts/${encodeURIComponent(slug)}`);
  },

  async getCategories() {
    return request<CategoryItem[]>("/api/v1/categories");
  },

  async getPostsByCategory(slug: string, params?: { page?: number; pageSize?: number }) {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<PostItem[]>(`/api/v1/categories/${encodeURIComponent(slug)}/posts${qs ? `?${qs}` : ""}`);
  },

  async getTags() {
    return request<TagItem[]>("/api/v1/tags");
  },

  async getPostsByTag(slug: string, params?: { page?: number; pageSize?: number }) {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<PostItem[]>(`/api/v1/tags/${encodeURIComponent(slug)}/posts${qs ? `?${qs}` : ""}`);
  },

  async searchPosts(query: string, params?: { page?: number; pageSize?: number }) {
    const q = new URLSearchParams({ q: query });
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    return request<PostItem[]>(`/api/v1/search?${q.toString()}`);
  },

  // Admin APIs
  async getAdminPosts(params?: { status?: string; page?: number; pageSize?: number; sort?: "published" | "updated" }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.sort) q.set("sort", params.sort);
    const qs = q.toString();
    return request<AdminPostItem[]>(`/api/v1/admin/posts${qs ? `?${qs}` : ""}`);
  },

  async getAdminPost(id: string) {
    return request<AdminPostItem>(`/api/v1/admin/posts/${id}`);
  },

  async createPost(input: {
    title: string;
    excerpt: string;
    contentMd: string;
    slug?: string;
    categoryId?: string | null;
    tagIds?: string[];
    coverImageUrl?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoImageUrl?: string | null;
  }) {
    const res = await request<AdminPostItem>("/api/v1/admin/posts", {
      method: "POST",
      body: JSON.stringify(input),
    });
    // Response-boundary proof (delivery §4.1): the create contract is
    // 201 + DRAFT + version 0 + a complete AdminPostDTO. Anything else is a
    // corrupt success → UNKNOWN, never a created post.
    if (res.error) return res;
    const created = res.status === 201
      && adminPostWriteResponseValid(res.data, { expectedStatus: "DRAFT", expectedVersion: 0 });
    return created ? res : invalidPostWriteResponse(res);
  },

  async updatePost(
    id: string,
    payload: {
      content?: {
        title?: string;
        excerpt?: string;
        contentMd?: string;
        slug?: string;
        categoryId?: string | null;
        tagIds?: string[];
        coverImageUrl?: string | null;
        seoTitle?: string | null;
        seoDescription?: string | null;
        seoImageUrl?: string | null;
      };
      action?: "publish" | "archive" | "restore";
      version: number;
    },
    /**
     * CLIENT-ONLY verification parameter — never serialized into the request
     * body. The caller must state the status a conforming response has to
     * carry: the action's target (publish→PUBLISHED, archive→ARCHIVED,
     * restore→DRAFT) for action requests, or the editor's known PRE-SAVE
     * status for a content save (the server preserves it; only optimistic
     * locking can change the outcome). Requiring it makes an unverified
     * "saved" claim impossible: a caller without a reliable baseline must
     * re-read before saving rather than trust any no-action 2xx.
     */
    verification: { expectedStatus: AdminPostItem["status"] },
  ) {
    const res = await request<AdminPostItem>(`/api/v1/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    // The contract is HTTP 200 (apiSuccess default on the PATCH route) with
    // the written object's id, version = request + 1 (the repository bumps
    // exactly once per PATCH), and the EXPECTED status. Anything else —
    // another 2xx, a mismatched id/status/version, or a mixed data+error
    // envelope — is a corrupt success → UNKNOWN (no success UI, no
    // navigation, no auto-replay).
    if (res.error) return res;
    const valid = res.status === 200
      && adminPostWriteResponseValid(res.data, {
        expectedId: id,
        expectedStatus: verification.expectedStatus,
        expectedVersion: payload.version + 1,
    });
    return valid ? res : invalidPostWriteResponse(res);
  },

  async deletePost(id: string, version: number) {
    const res = await request<void>(`/api/v1/admin/posts/${id}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
    });
    // The DELETE contract is 204 with an empty body; ONLY that proves a
    // definite hard delete. Any other 2xx (e.g. 200 with a JSON body) is a
    // corrupt success → UNKNOWN: the editor must not enter its
    // deleted-confirmed state, not navigate away, and never auto-retry the
    // delete. Definite error classifications (401/403/409/422) pass through.
    if (res.error) return res;
    return res.status === 204 ? res : invalidPostWriteResponse(res);
  },

  /**
   * Standalone public-cache refresh (FR-03 / delivery §4.2.3): retries ONLY
   * the cache invalidation for the blog's fixed public tags/paths. It never
   * repeats a create/update/publish/archive/delete, so calling it again after
   * a "刷新失败" warning is always safe.
   */
  async revalidatePublicCache() {
    return request<{ cacheStatus: string }>("/api/v1/admin/cache/revalidate", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getAdminCategories() {
    return request<AdminCategoryItem[]>("/api/v1/admin/categories");
  },

  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    sortOrder: number;
  }) {
    return request<AdminCategoryItem>("/api/v1/admin/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateCategory(
    id: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      icon?: string | null;
      sortOrder?: number;
      version: number;
    }
  ) {
    return request<AdminCategoryItem>(`/api/v1/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteCategory(id: string, version: number) {
    return request<void>(`/api/v1/admin/categories/${id}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
    });
  },

  async getAdminTags() {
    return request<AdminTagItem[]>("/api/v1/admin/tags");
  },

  async createTag(input: { name: string; slug: string }) {
    return request<AdminTagItem>("/api/v1/admin/tags", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateTag(id: string, input: { name?: string; slug?: string; version: number }) {
    return request<AdminTagItem>(`/api/v1/admin/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteTag(id: string, version: number) {
    return request<void>(`/api/v1/admin/tags/${id}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
    });
  },

  async getMe() {
    return request<{ id: string; email: string; displayName: string }>("/api/v1/auth/me");
  },
};
