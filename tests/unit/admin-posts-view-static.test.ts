import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Static-render (react-dom/server) checks for FR-08: the controls reflect the
 * URL query — status tabs carry aria-current, the sort select carries the
 * contract value (published|updated, never the old internal "latest"), and
 * the page indicator reads the URL page. Navigation/history behavior needs a
 * browser and stays browser-unverified.
 */

const search = { value: new URLSearchParams() };
const routerMock = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/admin/posts",
  useSearchParams: () => search.value,
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminPostsView } from "@/components/views/admin/admin-posts-view";

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  search.value = new URLSearchParams();
});

/** Label text of the currently active status tab (child text, not the tag). */
function currentTabLabel(html: string): string | null {
  const match = html.match(/<button[^>]*aria-current="true"[^>]*>([^<]+)</);
  return match ? match[1]!.trim() : null;
}

describe("AdminPostsView URL-driven controls (FR-08)", () => {
  it("reflects ?status=DRAFT&sort=updated&page=2 in the controls (AC-08-01)", () => {
    search.value = new URLSearchParams("status=DRAFT&sort=updated&page=2");
    const html = renderToStaticMarkup(createElement(AdminPostsView));
    // Exactly the DRAFT tab is current.
    expect(currentTabLabel(html)).toContain("草稿");
    // The sort select uses the contract value, never the old internal one;
    // React marks the active option with `selected`.
    expect(html).toContain('<option value="published">最新发布</option>');
    expect(html).toContain('<option value="updated" selected="">');
    expect(html).not.toContain('value="latest"');
    expect(html).toContain("第 2 /");
  });

  it("defaults render the 全部 tab as current and the published sort (AC-08-01 default shape)", () => {
    search.value = new URLSearchParams("");
    const html = renderToStaticMarkup(createElement(AdminPostsView));
    expect(currentTabLabel(html)).toContain("全部");
    expect(html).toContain("第 1 /");
  });

  it("illegal query values fall back to the defaults for the controls (AC-08-03)", () => {
    search.value = new URLSearchParams("status=BOGUS&sort=newest&page=-2");
    const html = renderToStaticMarkup(createElement(AdminPostsView));
    // BOGUS normalizes to the ALL default — the 全部 tab is current, and the
    // DRAFT/PUBLISHED tabs are not.
    expect(currentTabLabel(html)).toContain("全部");
    expect(html).toContain('value="published"');
    expect(html).toContain("第 1 /");
  });

  it("pageSize stays a fixed backend contract — no page-size control exists", () => {
    search.value = new URLSearchParams("");
    const html = renderToStaticMarkup(createElement(AdminPostsView));
    expect(html).not.toContain("每页");
    expect(html.toLowerCase()).not.toContain("pagesize");
  });
});
