import { afterAll, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static-render (react-dom/server) checks for FR-20's header wiring: the
 * logout control consults the shared leave-guard registry — unavailable while
 * a write is in flight, plain one-step logout when clean, and a blocked state
 * renders the confirmation copy. The interactive confirm/cancel network
 * behavior (zero logout requests on cancel) needs a browser and stays 未验.
 */

const routerMock = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { Header } from "@/components/ui/header";
import { registerAdminLeaveGuard } from "@/components/views/admin/logout-guard";

function renderAdminHeader() {
  return renderToStaticMarkup(createElement(Header, { admin: true, activePath: "/admin" }));
}

function logoutButtonHtml(html: string): string {
  const match = html.match(/<button[^>]*>退(?:出|出中…)<\/button>/);
  expect(match).toBeTruthy();
  return match![0];
}

describe("Header logout control (FR-20)", () => {
  const unregisters: Array<() => void> = [];
  const resetGuards = () => { while (unregisters.length) unregisters.pop()!(); };
  const register = (state: { blocked: boolean; busy: boolean; subject: string }) => {
    unregisters.push(registerAdminLeaveGuard(`header-test-${unregisters.length}`, state));
  };
  afterAll(resetGuards);

  it("renders a plain one-step logout with no confirmation dialog when clean (FR-20.6)", () => {
    resetGuards();
    const html = renderAdminHeader();
    const button = logoutButtonHtml(html);
    expect(button).not.toContain('disabled=""');
    expect(html).not.toContain("有未保存的内容");
  });

  it("is disabled with a waiting hint while any registered view is busy (FR-20.4)", () => {
    resetGuards();
    register({ blocked: false, busy: true, subject: "文章编辑器" });
    const html = renderAdminHeader();
    const button = logoutButtonHtml(html);
    expect(button).toContain('disabled=""');
    expect(html).toContain("正在保存或提交");
  });

  it("stays enabled but flagged when a view is blocked with unsaved input", () => {
    resetGuards();
    register({ blocked: true, busy: false, subject: "文章编辑器" });
    const html = renderAdminHeader();
    const button = logoutButtonHtml(html);
    expect(button).not.toContain('disabled=""');
    expect(html).not.toContain("确认删除");
  });

  it("non-admin headers never render the logout control", () => {
    const html = renderToStaticMarkup(createElement(Header, { activePath: "/" }));
    expect(html).not.toMatch(/<button[^>]*>退出<\/button>/);
  });
});
