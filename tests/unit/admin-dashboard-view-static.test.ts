import { describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static-render (react-dom/server) checks for FR-09: the three stat states —
 * first-read failure (no fake 0), confirmed success (real 0 allowed), and
 * network-class failure after earlier success (stale-annotated old value).
 * The live fetch/retry cycle needs a running app and stays browser-unverified.
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

import { AdminDashboardView, DashboardStatCard } from "@/components/views/admin/admin-dashboard-view";

const icon = createElement("span", { "aria-hidden": "true" }, "●");

type StatState = Parameters<typeof DashboardStatCard>[0]["state"];

function renderCard(state: StatState, value: number | null) {
  return renderToStaticMarkup(createElement(DashboardStatCard, {
    label: "标签总数", href: "/admin/tags", icon, state, value, onRetry: () => {},
  }));
}

describe("DashboardStatCard tri-state (FR-09)", () => {
  it("first failure shows 暂无法获取 + retry — never 0 (AC-09-01)", () => {
    const html = renderCard({ phase: "error", hasData: false, message: "网络连接失败，暂无法获取", stale: false }, 0);
    expect(html).toContain("暂无法获取");
    expect(html).toContain("重试");
    expect(html).not.toMatch(/>0</);
  });

  it("confirmed success with a real zero shows 0 (AC-09-01)", () => {
    const html = renderCard({ phase: "success", hasData: true }, 0);
    expect(html).toMatch(/>0</);
    expect(html).not.toContain("暂无法获取");
  });

  it("success with unknown total shows a dash plus an explicit unknown marker (AC-09-03)", () => {
    const html = renderCard({ phase: "success", hasData: true }, null);
    expect(html).toContain("总数未知");
    expect(html).toContain("—");
    // Never a recent-list length standing in for the total.
    expect(html).not.toMatch(/>5</);
  });

  it("network-class failure after earlier success keeps the old value with a staleness marker (AC-09-04)", () => {
    const html = renderCard({ phase: "error", hasData: true, message: "网络连接失败，暂无法获取", stale: true }, 23);
    expect(html).toMatch(/>23</);
    expect(html).toContain("数据可能不是最新");
    expect(html).toContain("读取失败");
  });

  it("retry loading over old data keeps showing the old value — not a dash or 0 (Codex review round 1)", () => {
    const html = renderCard({ phase: "loading", hasData: true }, 23);
    expect(html).toMatch(/>23</);
    expect(html).not.toContain("暂无法获取");
  });

  it("loading shows a dash, not zero", () => {
    const html = renderCard({ phase: "loading", hasData: false }, null);
    expect(html).toContain("—");
    expect(html).not.toContain("暂无法获取");
  });
});

describe("AdminDashboardView static render", () => {
  it("renders the dashboard shell; no fake zeros and no 新建第一篇 prompt in the initial loading state (FR-09.6)", () => {
    const html = renderToStaticMarkup(createElement(AdminDashboardView));
    expect(html).toContain("概览");
    expect(html).not.toContain("新建第一篇");
    expect(html).not.toContain("暂无文章");
  });
});
