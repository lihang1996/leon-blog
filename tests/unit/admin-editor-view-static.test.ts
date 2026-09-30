import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static-render (react-dom/server) tests for the restricted editor screens
 * (Codex review round 2): with no component-test framework in the repo and
 * no isolated browser available, these prove the ACTUAL rendered control set
 * of the locked states — the recovery panel and the post-delete screen must
 * contain no control able to write the (adopted or deleted) article ID.
 * Interactive flows (state transitions in the live browser) remain
 * browser-unverified and are covered by the createFlowDisposition tests.
 */

const routerMock = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/admin/posts/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  // Static-render stand-in: a plain anchor with the same href/child output.
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminEditorView, DeletedArticleScreen, RecoveryLockPanel } from "@/components/views/admin/admin-editor-view";

const WRITE_CONTROL_LABELS = ["保存草稿", "保存更新", "发布", "归档", "恢复为草稿", "删除文章", "新建文章"];

describe("RecoveryLockPanel (read-only recovery state)", () => {
  it("auth failure: offers re-login and list verification, never a write or a 'start new post' escape", () => {
    const html = renderToStaticMarkup(
      createElement(RecoveryLockPanel, { reason: "auth", onReload: () => {}, disabled: false }),
    );
    expect(html).toContain("重新登录");
    expect(html).toContain("在新标签页核对文章列表");
    expect(html).toContain("编辑已锁定");
    // No reload-from-server offer when the session itself is dead…
    expect(html).not.toContain("重新加载服务器内容");
    // …and none of the editor's write controls may appear here.
    for (const label of WRITE_CONTROL_LABELS) {
      expect(html).not.toContain(label);
    }
  });

  it("unknown outcome: offers the server reload as the explicit recovery path", () => {
    const html = renderToStaticMarkup(
      createElement(RecoveryLockPanel, { reason: "unknown", onReload: () => {}, disabled: false }),
    );
    expect(html).toContain("重新加载服务器内容");
    expect(html).toContain("不会自动重试");
    expect(html).toContain("重新登录");
  });

  it("address-normalization failure (Codex round 3): locked, points at the correct edit page, no reload-from-server", () => {
    const html = renderToStaticMarkup(
      createElement(RecoveryLockPanel, {
        reason: "address",
        onReload: () => {},
        disabled: false,
        editHref: "/admin/posts/11111111-1111-4111-8111-111111111111/edit",
      }),
    );
    expect(html).toContain("编辑已锁定");
    expect(html).toContain("/admin/posts/11111111-1111-4111-8111-111111111111/edit");
    expect(html).toContain("打开已保存的文章");
    // The address variant has no server-reload offer (reloading content does
    // not fix the address) and no write controls at all.
    expect(html).not.toContain("重新加载服务器内容");
    for (const label of WRITE_CONTROL_LABELS) {
      expect(html).not.toContain(label);
    }
  });

  it("renders the reload control as disabled while a reload is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(RecoveryLockPanel, { reason: "unknown", onReload: () => {}, disabled: true }),
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  });
});

describe("DeletedArticleScreen (post-delete locked screen)", () => {
  const render = (props: Partial<Parameters<typeof DeletedArticleScreen>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(DeletedArticleScreen, {
        serverIdentity: { title: "已删文章", slug: "gone-slug" },
        feedback: null,
        onRetryRefresh: () => {},
        refreshing: false,
        ...props,
      }),
    );

  it("states the delete, cites the server identity, and offers only list return + refresh retry", () => {
    const html = render();
    expect(html).toContain("文章已删除");
    expect(html).toContain("已删文章");
    expect(html).toContain("gone-slug");
    expect(html).toContain("返回文章列表");
    for (const label of WRITE_CONTROL_LABELS) {
      expect(html).not.toContain(label);
    }
  });

  it("shows the cache-refresh warning (with retry) when the refresh failed, and error-styled feedback", () => {
    const html = render({
      cacheNoticeMsg: "文章已删除，但公开内容刷新失败。请重试公开内容刷新并核对公开页面。",
      feedback: { type: "error", msg: "公开内容刷新仍未成功" },
    });
    expect(html).toContain("重试公开内容刷新");
    expect(html).toContain("公开内容刷新仍未成功");
  });
});

describe("AdminEditorView initial static render", () => {
  it("renders the blank new-post editor (sanity: the extraction did not break the default screen)", () => {
    const html = renderToStaticMarkup(createElement(AdminEditorView, {}));
    expect(html).toContain("新建文章");
    expect(html).toContain("正文 (Markdown)");
  });
});

describe("AdminEditorView field-level validation affordances (FR-07)", () => {
  it("shows the server's own length counters on title/excerpt/content", () => {
    const html = renderToStaticMarkup(createElement(AdminEditorView, {}));
    expect(html).toContain("0/120");
    expect(html).toContain("0/300");
    expect(html).toContain("0/204800");
  });

  it("never gates text inputs with maxLength (pasted over-limit text must surface, not truncate)", () => {
    const html = renderToStaticMarkup(createElement(AdminEditorView, {}));
    expect(html).not.toContain("maxlength");
  });

  it("shows the tag-count budget and keeps the SEO section collapsed by default", () => {
    const html = renderToStaticMarkup(createElement(AdminEditorView, {}));
    expect(html).toContain("0/10");
    expect(html).toMatch(/SEO 设置/);
    expect(html).toMatch(/aria-expanded="false"/);
  });
});
