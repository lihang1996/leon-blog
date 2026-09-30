import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static-render (react-dom/server) checks for FR-13 (and FR-06 wiring) in the
 * tags admin view. Effects (data loading, guard registration) do not run in
 * static render; interactive behaviors (confirm dialogs, focus order, touch)
 * remain browser-unverified and are reported as such.
 */

const routerMock = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/admin/tags",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminTagPill, AdminTagsView } from "@/components/views/admin/admin-tags-view";
import type { AdminTagItem } from "@/lib/client-api";

const tag: AdminTagItem = { id: "tag-1", name: "前端", slug: "frontend", version: 3, postCount: 12 };

describe("AdminTagPill (FR-13 delete entry markup)", () => {
  const render = () =>
    renderToStaticMarkup(createElement(AdminTagPill, {
      tag, needsReview: false, onEdit: () => {}, onDelete: () => {},
    }));

  it("keeps an accessible name that contains the tag name (AC-13-02)", () => {
    const html = render();
    expect(html).toContain('aria-label="删除标签 前端"');
  });

  it("is always visible — no hover-gated opacity anywhere (AC-13-01)", () => {
    const html = render();
    expect(html).not.toContain("opacity-0");
    expect(html).not.toContain("group-hover:opacity-100");
  });

  it("has a 44px touch target and a visible keyboard focus ring (AC-13-02/03)", () => {
    const html = render();
    expect(html).toMatch(/h-11 w-11/);
    expect(html).toMatch(/focus-visible:ring-2/);
    // The edit entry gets its own ≥44px hit area so adjacent pills can't be
    // mis-tapped (AC-13-03).
    expect(html).toMatch(/min-h-11/);
  });

  it("renders both entries next to the name and count without hiding either", () => {
    const html = render();
    expect(html).toContain("前端");
    expect(html).toContain("12");
    expect(html).toContain(">编辑</button>");
    expect(html).toContain("×");
  });
});

describe("AdminTagsView static render", () => {
  it("renders the management page without hover-gated pill controls and keeps the form accessible (FR-06 baseline wiring)", () => {
    const html = renderToStaticMarkup(createElement(AdminTagsView));
    // Button's pending overlay legitimately uses opacity-0, so scope the
    // hover-gating check to the class that only the old pill used.
    expect(html).not.toContain("group-hover:opacity-100");
    expect(html).toContain('aria-label="标签名称"');
    expect(html).toContain("标签管理");
    // The delete-confirmation modal stays closed with no target selected.
    expect(html).not.toContain("确认删除该标签？");
  });
});
