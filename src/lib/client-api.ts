/**
 * Client-side API request helper for Leon Blog.
 * Provides typed methods for interacting with public and admin REST endpoints.
 */

export interface PostItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd?: string;
  coverImageUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageUrl?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  } | null;
  postTags?: {
    tagId?: string;
    tag: {
      id: string;
      name: string;
      slug: string;
    };
  }[];
  tags?: TagItem[];
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
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TagItem {
  id: string;
  name: string;
  slug: string;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data?: T;
  meta?: PaginationMeta;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
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
        .filter((tag): tag is TagItem => Boolean(tag))
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

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; meta?: PaginationMeta; error: string | null }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (res.status === 204) {
      return { data: null, error: null };
    }

    const json = (await res.json()) as ApiResponse<T>;

    if (!res.ok) {
      return {
        data: null,
        error: json.error?.message || `请求失败 (${res.status})`,
      };
    }

    let rawData: unknown = json.data !== undefined ? json.data : (json as unknown as T);
    if (Array.isArray(rawData)) {
      rawData = rawData.map((item) =>
        isRecord(item) && ("slug" in item || "title" in item) ? normalizePostItem(item) : item
      );
    } else if (isRecord(rawData) && ("slug" in rawData || "title" in rawData)) {
      rawData = normalizePostItem(rawData);
    }

    return {
      data: rawData as T,
      meta: json.meta,
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "网络请求异常";
    return { data: null, error: msg };
  }
}

export const clientApi = {
  // Public APIs
  async getPosts(params?: { page?: number; pageSize?: number }) {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
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
  async getAdminPosts(params?: { status?: string; page?: number; pageSize?: number }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<PostItem[]>(`/api/v1/admin/posts${qs ? `?${qs}` : ""}`);
  },

  async getAdminPost(id: string) {
    return request<PostItem>(`/api/v1/admin/posts/${id}`);
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
    return request<PostItem>("/api/v1/admin/posts", {
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
    }
  ) {
    return request<PostItem>(`/api/v1/admin/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deletePost(id: string) {
    return request<void>(`/api/v1/admin/posts/${id}`, {
      method: "DELETE",
    });
  },

  async getAdminCategories() {
    return request<CategoryItem[]>("/api/v1/admin/categories");
  },

  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    sortOrder: number;
  }) {
    return request<CategoryItem>("/api/v1/admin/categories", {
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
    }
  ) {
    return request<CategoryItem>(`/api/v1/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteCategory(id: string) {
    return request<void>(`/api/v1/admin/categories/${id}`, {
      method: "DELETE",
    });
  },

  async getAdminTags() {
    return request<TagItem[]>("/api/v1/admin/tags");
  },

  async createTag(input: { name: string; slug: string }) {
    return request<TagItem>("/api/v1/admin/tags", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateTag(id: string, input: { name?: string; slug?: string }) {
    return request<TagItem>(`/api/v1/admin/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteTag(id: string) {
    return request<void>(`/api/v1/admin/tags/${id}`, {
      method: "DELETE",
    });
  },

  async getMe() {
    return request<{ id: string; email: string; displayName: string }>("/api/v1/auth/me");
  },
};
