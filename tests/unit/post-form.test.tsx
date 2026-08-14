// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostForm } from "@/components/admin/post-form";
import type { AdminPostDTO } from "@/modules/post";
import type { AdminCategoryDTO } from "@/modules/category";
import type { AdminTagDTO } from "@/modules/tag";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const categories: AdminCategoryDTO[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "前端", slug: "frontend", description: null, sortOrder: 1, postCount: 0 },
];
const tags: AdminTagDTO[] = [{ id: "22222222-2222-4222-8222-222222222222", name: "React", slug: "react", postCount: 0 }];

function post(overrides: Partial<AdminPostDTO> = {}): AdminPostDTO {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    title: "已有文章",
    slug: "existing",
    excerpt: "摘要",
    contentMd: "# 正文",
    coverImageUrl: null,
    status: "DRAFT",
    seoTitle: null,
    seoDescription: null,
    seoImageUrl: null,
    categoryId: null,
    tagIds: [],
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: post({ status: "DRAFT" }) }),
    })),
  );
});

describe("PostForm P0 behaviors", () => {
  it("labels the primary button 保存草稿 for drafts and 保存更新 otherwise", () => {
    const { unmount } = render(
      <PostForm post={post({ status: "DRAFT" })} categories={categories} tags={tags} allowedImageHosts={[]} />,
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeTruthy();
    unmount();

    const published = render(
      <PostForm post={post({ status: "PUBLISHED" })} categories={categories} tags={tags} allowedImageHosts={[]} />,
    );
    expect(screen.getByRole("button", { name: "保存更新" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
    published.unmount();

    render(<PostForm post={post({ status: "ARCHIVED" })} categories={categories} tags={tags} allowedImageHosts={[]} />);
    expect(screen.getByRole("button", { name: "保存更新" })).toBeTruthy();
  });

  it("saves published posts as a content PATCH, not publish/archive", async () => {
    const user = userEvent.setup();
    render(<PostForm post={post({ status: "PUBLISHED" })} categories={categories} tags={tags} allowedImageHosts={[]} />);
    await user.click(screen.getByRole("button", { name: "保存更新" }));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ content: expect.any(Object) });
    expect(JSON.parse(String(init.body)).action).toBeUndefined();
  });

  it("registers beforeunload only while dirty and clears it after a successful save", async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    render(<PostForm post={post()} categories={categories} tags={tags} allowedImageHosts={[]} />);

    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);

    await user.type(screen.getByLabelText("标题"), "改");
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await vi.waitFor(() => {
      expect(remove.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    });
  });

  it("opens ConfirmDialog for 下线归档 and only archives after confirm", async () => {
    const user = userEvent.setup();
    render(
      <PostForm
        post={post({ status: "PUBLISHED", publishedAt: "2026-01-01T00:00:00.000Z" })}
        categories={categories}
        tags={tags}
        allowedImageHosts={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "下线归档" }));
    const dialog = screen.getByRole("dialog", { name: "下线归档这篇文章？" });
    expect(dialog).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByText("当前状态：已发布")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "下线归档" }));
    const confirmDialog = screen.getByRole("dialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "下线归档" }));
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ action: "archive" });
  });
});
