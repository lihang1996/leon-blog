// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryManager } from "@/components/admin/category-manager";
import { mapCategoryFormError, mapTagFormError } from "@/components/admin/entity-form-errors";
import { FormField, adminInputClass } from "@/components/admin/form-field";
import { LoginForm } from "@/components/admin/login-form";
import { PostForm } from "@/components/admin/post-form";
import { TagManager } from "@/components/admin/tag-manager";
import { Button } from "@/components/ui/button";
import type { AdminCategoryDTO } from "@/modules/category";
import type { AdminPostDTO } from "@/modules/post";
import type { AdminTagDTO } from "@/modules/tag";

const externalMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: externalMocks.signIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: externalMocks.push,
    refresh: externalMocks.refresh,
    replace: externalMocks.replace,
  }),
}));

const projectRoot = process.cwd();

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readSourceTree(path);
      return /\.(css|ts|tsx)$/.test(entry.name) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("focus styling contracts", () => {
  it("defines semantic focus tokens, typed selectors, brand fallback, and forced-color recovery", () => {
    const css = readFileSync(join(projectRoot, "src/app/globals.css"), "utf8");
    const playwrightConfig = readFileSync(join(projectRoot, "playwright.config.ts"), "utf8");
    const focusTests = [
      "focus-interactions.test.tsx",
      "focus-semantics.test.tsx",
      "../e2e/focus-style-contract.spec.ts",
      "../e2e/focus-keyboard-a11y.spec.ts",
      "../e2e/focus-route-matrix.spec.ts",
      "../e2e/focus-forced-colors.spec.ts",
    ]
      .map((file) => readFileSync(join(projectRoot, "tests/unit", file), "utf8"))
      .join("\n");
    const interactiveSource = [
      readSourceTree(join(projectRoot, "src/app")),
      readSourceTree(join(projectRoot, "src/components")),
      readSourceTree(join(projectRoot, "src/styles")),
      readFileSync(join(projectRoot, "src/lib/markdown/markdown-renderer.tsx"), "utf8"),
    ].join("\n");

    expect(css).toMatch(/--color-focus-surface:\s*#f7e6e2;/);
    expect(css).toMatch(/--color-focus-accent:\s*#a93b27;/);
    expect(css).toMatch(/--color-focus-on-accent:\s*#ffffff;/);
    expect(css).toMatch(/--focus-indicator-width:\s*2px;/);
    expect(css).toMatch(/--focus-underline-thickness:\s*2px;/);
    expect(css).not.toMatch(/--color-focus:\s*#171717/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*var\(--color-focus-accent\)/s);
    expect(css).toMatch(/\.focus-input:not\(:disabled\):not\(\[readonly\]\):focus/);
    expect(css).toMatch(/\.focus-action-primary:focus-visible/);
    expect(css).toMatch(/\.focus-action-secondary:focus-visible/);
    expect(css).toMatch(/\.focus-action-danger:focus-visible/);
    expect(css).toMatch(/\.focus-action-primary:active:not\(:focus-visible\):not\(:disabled\)[^{]*\{[^}]*color-mix/s);
    expect(css).toMatch(/\.focus-icon:active:not\(:focus-visible\):not\(:disabled\)[^{]*\{[^}]*color-mix/s);
    expect(css).toMatch(/\.focus-action-primary:active:focus-visible:not\(:disabled\)[^{]*\{[^}]*box-shadow:\s*inset/s);
    expect(css).toMatch(/\.focus-action-secondary:active:focus-visible:not\(:disabled\)[\s\S]*box-shadow:\s*inset/s);
    expect(css).toMatch(/\.focus-link:active:focus-visible[\s\S]*text-decoration-thickness/s);
    expect(css).toMatch(/--color-placeholder:\s*#69635b/);
    expect(css).toMatch(/\.focus-input::placeholder[\s\S]*var\(--color-placeholder\)/s);
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*outline:[^;]*Highlight/);
    expect(interactiveSource).not.toMatch(/\bfocus-ring\b/);
    expect(interactiveSource).not.toContain("focus-visible:outline-focus");
    expect(readFileSync(join(projectRoot, "src/app/global-error.tsx"), "utf8")).toContain('import "./globals.css"');
    expect(playwrightConfig).toContain("AGENT_OS_TEST_RESOURCE_SENTINEL");
    expect(playwrightConfig).toContain('process.env.AGENT_OS_TEST_RESOURCE_SENTINEL !== "true"');
    expect(playwrightConfig).toContain("sameDatabaseIdentity");
    expect(playwrightConfig).toContain("controller-bound");
    expect(playwrightConfig).toMatch(/DATABASE_URL[\s\S]*test\|ci\|e2e\|tmp/);
    expect(focusTests).not.toMatch(/\b(?:test|it|describe)\.(?:skip|only|todo)\b/);
  });

  it("maps button variants and preserves the pending action name and footprint", () => {
    render(
      <>
        <Button>主要操作</Button>
        <Button variant="secondary">次要操作</Button>
        <Button variant="danger">危险操作</Button>
        <Button pending>保存草稿</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "主要操作" })).toHaveClass("focus-action-primary");
    expect(screen.getByRole("button", { name: "次要操作" })).toHaveClass("focus-action-secondary");
    expect(screen.getByRole("button", { name: "危险操作" })).toHaveClass("focus-action-danger");

    const pending = screen.getByRole("button", { name: "保存草稿" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveAccessibleName("保存草稿");
    expect(pending).toHaveClass("inline-grid", "grid-cols-[1fr]");
    expect(screen.getByText("保存草稿")).toHaveClass("opacity-0");
    const busyLayer = within(pending).getByText("处理中…").closest('[aria-hidden="true"]');
    expect(busyLayer).toHaveClass("col-start-1", "row-start-1");
  });

  it("renders stable hint and error ids for explicitly associated controls", () => {
    render(
      <>
        <span id="external-note">外部说明</span>
        <FormField label="标题" htmlFor="post-title" hint="最多 120 字" error="标题不能为空">
          <input
            id="post-title"
            aria-invalid="true"
            aria-describedby="external-note post-title-hint post-title-error"
            className={adminInputClass}
          />
        </FormField>
      </>,
    );

    const input = screen.getByLabelText("标题");
    const hint = screen.getByText("最多 120 字");
    const error = screen.getByRole("alert");
    expect(input).toHaveClass("focus-input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "external-note post-title-hint post-title-error");
    expect(hint).toHaveAttribute("id", "post-title-hint");
    expect(error).toHaveAttribute("id", "post-title-error");
  });

  it("maps every pathless category and tag business code to its explicit field", () => {
    const categoryDetailCases = [
      ["CATEGORY_NAME_EMPTY", "name"],
      ["CATEGORY_NAME_TOO_LONG", "name"],
      ["CATEGORY_SLUG_TOO_LONG", "slug"],
      ["CATEGORY_SLUG_INVALID", "slug"],
      ["CATEGORY_DESCRIPTION_TOO_LONG", "description"],
    ] as const;
    const tagDetailCases = [
      ["TAG_NAME_EMPTY", "name"],
      ["TAG_NAME_TOO_LONG", "name"],
      ["TAG_SLUG_TOO_LONG", "slug"],
      ["TAG_SLUG_INVALID", "slug"],
    ] as const;

    for (const [code, field] of categoryDetailCases) {
      expect(
        mapCategoryFormError({
          code: "VALIDATION_FAILED",
          message: "输入校验失败",
          details: [{ code, message: code }],
        }),
      ).toEqual({ [field]: code });
    }
    for (const [code, field] of tagDetailCases) {
      expect(
        mapTagFormError({
          code: "VALIDATION_FAILED",
          message: "输入校验失败",
          details: [{ code, message: code }],
        }),
      ).toEqual({ [field]: code });
    }

    expect(mapCategoryFormError({ code: "CATEGORY_NAME_EXISTS", message: "名称已存在" })).toEqual({ name: "名称已存在" });
    expect(mapCategoryFormError({ code: "CATEGORY_SLUG_EXISTS", message: "slug 已存在" })).toEqual({ slug: "slug 已存在" });
    expect(mapCategoryFormError({ code: "CATEGORY_NOT_FOUND", message: "分类不存在" })).toEqual({ global: "分类不存在" });
    expect(mapTagFormError({ code: "TAG_NAME_EXISTS", message: "名称已存在" })).toEqual({ name: "名称已存在" });
    expect(mapTagFormError({ code: "TAG_SLUG_EXISTS", message: "slug 已存在" })).toEqual({ slug: "slug 已存在" });
    expect(mapTagFormError({ code: "TAG_NOT_FOUND", message: "标签不存在" })).toEqual({ global: "标签不存在" });
  });

  it("maps a real category pathless validation envelope onto explicit field error semantics", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "输入校验失败",
              details: [
                { code: "CATEGORY_NAME_EMPTY", message: "名称不能为空" },
                { code: "CATEGORY_SLUG_INVALID", message: "Slug 格式不正确" },
                { code: "CATEGORY_DESCRIPTION_TOO_LONG", message: "说明不能超过 200 个字符" },
              ],
              requestId: "request-category-pathless",
            },
          },
          422,
        ),
      ),
    );

    render(<CategoryManager initialCategories={[]} />);
    await user.click(screen.getByRole("button", { name: "创建分类" }));

    const name = screen.getByLabelText("名称");
    const slug = screen.getByLabelText("Slug");
    const description = screen.getByLabelText("说明");
    expect(await screen.findByText("名称不能为空")).toHaveAttribute("id", "cat-name-error");
    expect(screen.getByText("Slug 格式不正确")).toHaveAttribute("id", "cat-slug-error");
    expect(screen.getByText("说明不能超过 200 个字符")).toHaveAttribute("id", "cat-desc-error");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "cat-name-error");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAttribute("aria-describedby", "cat-slug-hint cat-slug-error");
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAttribute("aria-describedby", "cat-desc-error");
  });

  it("maps a real tag pathless validation envelope instead of a detached global alert", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "输入校验失败",
              details: [
                { code: "TAG_NAME_TOO_LONG", message: "标签名称过长" },
                { code: "TAG_SLUG_INVALID", message: "标签 slug 格式不正确" },
              ],
              requestId: "request-tag-pathless",
            },
          },
          422,
        ),
      ),
    );

    render(<TagManager initialTags={[]} />);
    await user.click(screen.getByRole("button", { name: "创建标签" }));

    const name = screen.getByLabelText("名称");
    const slug = screen.getByLabelText("Slug");
    expect(await screen.findByText("标签名称过长")).toHaveAttribute("id", "tag-name-error");
    expect(screen.getByText("标签 slug 格式不正确")).toHaveAttribute("id", "tag-slug-error");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "tag-name-error");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAttribute("aria-describedby", "tag-slug-hint tag-slug-error");
    expect(screen.queryByText("输入校验失败")).not.toBeInTheDocument();
  });

  it.each([
    { code: "POST_SLUG_EXISTS", message: "文章 slug 已存在", status: 409, field: "slug" },
    { code: "CATEGORY_NOT_FOUND", message: "分类不存在", status: 404, field: "category" },
    { code: "TAG_NOT_FOUND", message: "标签不存在", status: 404, field: "tags" },
  ] as const)("maps a top-level $code API envelope to the post field", async ({ code, message, status, field }) => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code,
              message,
              requestId: `request-${code.toLowerCase()}`,
            },
          },
          status,
        ),
      ),
    );

    render(
      <PostForm
        post={null}
        categories={[
          { id: "category-1", name: "前端", slug: "frontend", description: null, sortOrder: 0, postCount: 0 },
        ]}
        tags={[{ id: "tag-1", name: "React", slug: "react", postCount: 0 }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    const error = await screen.findByText(message);
    if (field === "slug") {
      const slug = screen.getByLabelText("Slug");
      expect(error).toHaveAttribute("id", "post-slug-error");
      expect(slug).toHaveAttribute("aria-invalid", "true");
      expect(slug).toHaveAttribute("aria-describedby", "post-slug-hint post-slug-error");
    } else if (field === "category") {
      const category = screen.getByLabelText("分类");
      expect(error).toHaveAttribute("id", "post-category-error");
      expect(category).toHaveAttribute("aria-invalid", "true");
      expect(category).toHaveAttribute("aria-describedby", "post-category-error");
    } else {
      const fieldset = error.closest("fieldset");
      const visibleChoiceContainer = fieldset?.querySelector(".max-h-44");
      expect(error).toHaveAttribute("id", "post-tags-error");
      expect(fieldset).toHaveAttribute("aria-invalid", "true");
      expect(fieldset).toHaveAttribute("aria-describedby", "post-tags-limit post-tags-error");
      expect(visibleChoiceContainer).toHaveClass("border-danger");
      expect(visibleChoiceContainer).not.toHaveClass("border-border");
    }
    expect(screen.queryByText("操作失败，请重试")).not.toBeInTheDocument();
  });

  it("closes a category confirmation dialog before exposing a recoverable delete error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: "仍有关联文章，无法删除" } }),
      }),
    );

    render(
      <CategoryManager
        initialCategories={[
          { id: "category-1", name: "前端", slug: "frontend", description: null, sortOrder: 0, postCount: 2 },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "删除" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "删除分类" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("仍有关联文章，无法删除");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("prevents a category save from racing a delete operation", async () => {
    const user = userEvent.setup();
    const categories: AdminCategoryDTO[] = [
      { id: "category-1", name: "前端", slug: "frontend", description: null, sortOrder: 0, postCount: 2 },
    ];
    let resolveSave!: (response: Response) => void;
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(saveResponse)
      .mockResolvedValueOnce(jsonResponse({ data: categories }, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryManager initialCategories={categories} />);
    const save = screen.getByRole("button", { name: "创建分类" });
    const remove = screen.getByRole("button", { name: "删除" });
    await user.click(save);

    expect(save).toBeDisabled();
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveSave(jsonResponse({ data: categories[0] }, 201));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(save).toBeEnabled());
    expect(remove).toBeEnabled();
  });

  it("prevents a pending tag delete from being cancelled or raced by save", async () => {
    const user = userEvent.setup();
    const tags: AdminTagDTO[] = [{ id: "tag-1", name: "无障碍", slug: "a11y", postCount: 0 }];
    let resolveDelete!: (response: Response) => void;
    const deleteResponse = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(deleteResponse)
      .mockResolvedValueOnce(jsonResponse({ data: [] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<TagManager initialTags={tags} />);
    await user.click(screen.getByRole("button", { name: "删除" }));
    const confirm = screen.getByRole("button", { name: "删除标签" });
    await user.click(confirm);

    const dialog = screen.getByRole("dialog");
    const save = screen.getByRole("button", { name: "创建标签" });
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(save).toBeDisabled();
    await user.click(save);
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveDelete(new Response(null, { status: 204 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("row", { name: /无障碍/ })).not.toBeInTheDocument();
  });

  it("keeps focus on the next category row after a 204 delete, refresh, and trigger unmount", async () => {
    const user = userEvent.setup();
    const categories: AdminCategoryDTO[] = [
      { id: "category-1", name: "前端", slug: "frontend", description: null, sortOrder: 0, postCount: 2 },
      { id: "category-2", name: "后端", slug: "backend", description: null, sortOrder: 1, postCount: 1 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ data: [categories[1]] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryManager initialCategories={categories} />);
    const deletedRow = screen.getByRole("row", { name: /前端/ });
    const deletedTrigger = within(deletedRow).getByRole("button", { name: "删除" });
    await user.click(deletedTrigger);
    await user.click(screen.getByRole("button", { name: "删除分类" }));

    await waitFor(() => expect(screen.queryByRole("row", { name: /前端/ })).not.toBeInTheDocument());
    const remainingRow = screen.getByRole("row", { name: /后端/ });
    const nextEdit = within(remainingRow).getByRole("button", { name: "编辑" });
    await waitFor(() => expect(nextEdit).toHaveFocus());
    expect(deletedTrigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(nextEdit);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/admin/categories/category-1", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/admin/categories");
    expect(externalMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the first tag field as a stable focus fallback when the deleted row was last", async () => {
    const user = userEvent.setup();
    const tags: AdminTagDTO[] = [{ id: "tag-1", name: "无障碍", slug: "a11y", postCount: 0 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<TagManager initialTags={tags} />);
    const deletedRow = screen.getByRole("row", { name: /无障碍/ });
    const deletedTrigger = within(deletedRow).getByRole("button", { name: "删除" });
    const fallback = screen.getByLabelText("名称");
    await user.click(deletedTrigger);
    await user.click(screen.getByRole("button", { name: "删除标签" }));

    await waitFor(() => expect(screen.queryByRole("row", { name: /无障碍/ })).not.toBeInTheDocument());
    await waitFor(() => expect(fallback).toHaveFocus());
    expect(deletedTrigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(fallback);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/admin/tags/tag-1", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/admin/tags");
    expect(externalMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a committed category deletion local and restores next-row focus when refresh fails", async () => {
    const user = userEvent.setup();
    const categories: AdminCategoryDTO[] = [
      { id: "category-1", name: "前端", slug: "frontend", description: null, sortOrder: 0, postCount: 2 },
      { id: "category-2", name: "后端", slug: "backend", description: null, sortOrder: 1, postCount: 1 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "同步服务暂时不可用" } }, 503));
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryManager initialCategories={categories} />);
    const deletedRow = screen.getByRole("row", { name: /前端/ });
    const deletedTrigger = within(deletedRow).getByRole("button", { name: "删除" });
    await user.click(deletedTrigger);
    await user.click(screen.getByRole("button", { name: "删除分类" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("删除已完成，但列表同步失败");
    expect(screen.queryByRole("row", { name: /前端/ })).not.toBeInTheDocument();
    const nextEdit = within(screen.getByRole("row", { name: /后端/ })).getByRole("button", { name: "编辑" });
    await waitFor(() => expect(nextEdit).toHaveFocus());
    expect(deletedTrigger.isConnected).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(externalMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the stable tag fallback and reports sync recovery after a malformed refresh", async () => {
    const user = userEvent.setup();
    const tags: AdminTagDTO[] = [{ id: "tag-1", name: "无障碍", slug: "a11y", postCount: 0 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "not-an-array" } }, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<TagManager initialTags={tags} />);
    const deletedRow = screen.getByRole("row", { name: /无障碍/ });
    const deletedTrigger = within(deletedRow).getByRole("button", { name: "删除" });
    const fallback = screen.getByLabelText("名称");
    await user.click(deletedTrigger);
    await user.click(screen.getByRole("button", { name: "删除标签" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("删除已完成，但列表同步失败");
    expect(screen.queryByRole("row", { name: /无障碍/ })).not.toBeInTheDocument();
    await waitFor(() => expect(fallback).toHaveFocus());
    expect(deletedTrigger.isConnected).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(externalMocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("form focus semantics", () => {
  it("associates a uniform login failure with both credential fields", async () => {
    const user = userEvent.setup();
    externalMocks.signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginForm />);

    const email = screen.getByLabelText("邮箱");
    const password = screen.getByLabelText("密码");
    const submit = screen.getByRole("button", { name: "登录" });
    expect(email).toHaveClass("focus-input");
    expect(password).toHaveClass("focus-input");
    expect(submit).toBeDisabled();

    await user.type(email, "editor@example.com");
    await user.type(password, "incorrect-password");
    expect(submit).toBeEnabled();
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(externalMocks.signIn).toHaveBeenCalledWith("credentials", {
      email: "editor@example.com",
      password: "incorrect-password",
      redirect: false,
    });
    expect(alert).toHaveAttribute("id", "login-error");
    expect(alert).toHaveTextContent("邮箱或密码错误，请重试");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "login-error");
    expect(password).toHaveAttribute("aria-describedby", "login-error");
    expect(submit).not.toHaveAttribute("aria-busy");
    expect(externalMocks.push).not.toHaveBeenCalled();
  });

  it("disables only unselected tags at the ten-tag limit and re-enables them after a deselection", async () => {
    const user = userEvent.setup();
    const tags: AdminTagDTO[] = Array.from({ length: 11 }, (_, index) => ({
      id: `tag-${index + 1}`,
      name: `标签 ${index + 1}`,
      slug: `tag-${index + 1}`,
      postCount: 0,
    }));
    const post: AdminPostDTO = {
      id: "post-1",
      title: "测试文章",
      slug: "test-post",
      excerpt: "摘要",
      contentMd: "正文",
      coverImageUrl: null,
      status: "DRAFT",
      seoTitle: null,
      seoDescription: null,
      seoImageUrl: null,
      categoryId: null,
      tagIds: tags.slice(0, 10).map((tag) => tag.id),
      publishedAt: null,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };

    render(<PostForm post={post} categories={[]} tags={tags} />);
    const checkboxes = screen.getAllByRole("checkbox");
    const first = checkboxes[0]!;
    const last = checkboxes[10]!;
    expect(checkboxes).toHaveLength(11);
    expect(checkboxes.slice(0, 10).every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(first).toBeEnabled();
    expect(last).toBeDisabled();
    expect(last).toHaveAttribute("aria-describedby", "post-tags-limit");
    expect(last.closest("label")).toHaveClass("focus-choice");
    expect(last.closest("label")).not.toHaveClass("hover:bg-bg");
    expect(screen.getByRole("status")).toHaveTextContent("已选择 10 个标签");

    checkboxes[9]!.focus();
    await user.tab();
    expect(screen.getByLabelText("封面图片 URL")).toHaveFocus();

    await user.click(first);
    expect(first).not.toBeChecked();
    expect(last).toBeEnabled();
    expect(last.closest("label")).toHaveClass("hover:bg-bg");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("还可选择 1 个标签。")).toBeInTheDocument();

    checkboxes[9]!.focus();
    await user.tab();
    expect(last).toHaveFocus();

    await user.click(last);
    expect(last).toBeChecked();
    expect(first).toBeDisabled();
    expect(first.closest("label")).not.toHaveClass("hover:bg-bg");
    expect(checkboxes.filter((checkbox) => (checkbox as HTMLInputElement).checked)).toHaveLength(10);
    expect(screen.getByRole("status")).toHaveTextContent("已选择 10 个标签");
  });

  it("opens the SEO disclosure when a field-level error would otherwise be hidden", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: "VALIDATION_FAILED",
            message: "输入校验失败",
            details: [{ path: "seoTitle", message: "SEO 标题过长" }],
          },
        }),
      }),
    );

    render(<PostForm post={null} categories={[]} tags={[]} />);
    const details = screen.getByText("SEO 设置").closest("details");
    expect(details).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    const seoTitle = await screen.findByLabelText("SEO 标题");
    expect(screen.getByText("SEO 标题过长")).toHaveAttribute("id", "post-seo-title-error");
    await waitFor(() => expect(details).toHaveAttribute("open"));
    expect(seoTitle).toHaveAttribute("aria-invalid", "true");
    expect(seoTitle).toHaveAttribute("aria-describedby", "post-seo-title-hint post-seo-title-error");
  });
});
