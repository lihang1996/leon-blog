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
  if (res.status === 204) return { data: null, error: null, status: res.status, requestId };

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

  let rawData: unknown = json.data;
  if (rawData === undefined) {
    return { data: null, error: "服务器返回了无法识别的数据", status: res.status, errorCode: "INVALID_RESPONSE", requestId };
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
  return { data: rawData as T, meta: json.pagination, error: null, status: res.status, requestId };
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
    return request<AdminPostItem>("/api/v1/admin/posts", {
      method: "POST",
      body: JSON.stringify(input),
    });
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
    }
  ) {
    return request<AdminPostItem>(`/api/v1/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deletePost(id: string, version: number) {
    return request<void>(`/api/v1/admin/posts/${id}`, {
      method: "DELETE",
      headers: { "If-Match": `"${version}"` },
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
