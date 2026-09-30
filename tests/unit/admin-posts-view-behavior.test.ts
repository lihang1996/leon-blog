import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * FR-08/FR-09 behavioral tests (Codex review round 1):
 *  - the four COUNT requests masking on a lone 401/403 exactly like the list
 *    request (list success + counts auth failure interleaved);
 *  - a LATE list response for a superseded query never overwrites the newer
 *    condition's rendered rows (executable race test, not source reasoning).
 */

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  api: { getAdminPosts: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
  search: { value: new URLSearchParams() },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [harness.values[index], (value: T | ((prev: T) => T)) => {
        harness.values[index] = typeof value === "function" ? (value as (prev: T) => T)(harness.values[index] as T) : value;
      }];
    },
    useRef<T>(initial: T) {
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = { current: initial };
      return harness.values[index] as { current: T };
    },
    useEffect(effect: () => void | (() => void)) { harness.effects.push(effect); },
    // Layout effects (lifecycle bookkeeping / listener setup on unmount-only
    // cleanups) are no-ops here: React only runs their cleanups on unmount,
    // and blindly replaying them would fake dep-change semantics.
    useLayoutEffect: () => {},
    useCallback<T>(callback: T) { return callback; },
  };
});
vi.mock("@/lib/client-api", () => ({
  isAuthFailure: (result: { status?: number; errorCode?: string | null }) =>
    result.status === 401 || result.status === 403
    || ["AUTH_REQUIRED", "AUTH_INVALID", "ADMIN_DISABLED"].includes(result.errorCode ?? ""),
  clientApi: { getAdminPosts: harness.api.getAdminPosts },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/admin/posts",
  useSearchParams: () => harness.search.value,
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminPostsView } from "@/components/views/admin/admin-posts-view";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

type ListResult = { data: { id: string; title: string; slug: string; status: string; version: number }[]; meta: { page: number; pageSize: number; total: number; totalPages: number }; error: string | null; status: number; errorCode?: string };
const okPage = (titles: string[], total = titles.length): ListResult => ({
  data: titles.map((title, index) => ({ id: `id-${title}`, title, slug: `slug-${index}`, status: "DRAFT", version: 1 })),
  meta: { page: 1, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
  error: null,
  status: 200,
});

function render() {
  harness.cursor = 0;
  return renderToStaticMarkup(createElement(AdminPostsView));
}

async function flushEffects() {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  const fns = harness.effects.splice(0);
  for (const fn of fns) {
    const cleanup = fn();
    if (typeof cleanup === "function") harness.cleanups.push(cleanup);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  harness.search.value = new URLSearchParams();
});

describe("AdminPostsView counts vs list interleaving (FR-09.5, Codex round 1)", () => {
  it("list success + counts 401 masks the whole view behind the re-login screen", async () => {
    render();
    // Call order after one effect flush: #0 list, #1-#4 the four count reads.
    const list = deferred<ListResult>();
    const counts = [0, 1, 2, 3].map(() => deferred<ListResult>());
    harness.api.getAdminPosts.mockImplementationOnce(() => list.promise);
    for (const count of counts) harness.api.getAdminPosts.mockImplementationOnce(() => count.promise);
    await flushEffects();
    list.resolve(okPage(["列表文章"]));
    for (const count of counts) {
      count.resolve({ data: [], meta: { page: 1, pageSize: 1, total: 0, totalPages: 1 }, error: "登录状态已失效", status: 401, errorCode: "AUTH_REQUIRED" });
    }
    await tick();
    const html = render();
    expect(html).toContain("登录状态已失效");
    expect(html).toContain("重新登录");
    // The successfully loaded table must be masked, not kept.
    expect(html).not.toContain("列表文章");
    expect(html).not.toContain("发布时间");
  });

  it("a single count-request failure that is NOT auth keeps old counts with the retry note (unchanged semantics)", async () => {
    render();
    const list = deferred<ListResult>();
    const counts = [0, 1, 2, 3].map(() => deferred<ListResult>());
    harness.api.getAdminPosts.mockImplementationOnce(() => list.promise);
    for (const count of counts) harness.api.getAdminPosts.mockImplementationOnce(() => count.promise);
    await flushEffects();
    list.resolve(okPage(["列表文章"]));
    const okCount = okPage([], 4);
    counts[0]!.resolve(okCount);
    counts[1]!.resolve({ ...okCount, error: "网络请求失败，请检查连接后重试", status: 0, errorCode: "NETWORK_ERROR" });
    counts[2]!.resolve(okCount);
    counts[3]!.resolve(okCount);
    await tick();
    const html = render();
    expect(html).toContain("列表文章");
    expect(html).toContain("统计刷新失败");
    expect(html).not.toContain("登录状态已失效");
  });
});

describe("AdminPostsView late-response race (FR-08.5)", () => {
  it("a late response for a superseded condition never overwrites the newer rows", async () => {
    harness.search.value = new URLSearchParams("status=DRAFT");
    render();
    // Round 1: the DRAFT list request stays pending; counts resolve quietly.
    const requestA = deferred<ListResult>();
    const counts1 = [0, 1, 2, 3].map(() => deferred<ListResult>());
    harness.api.getAdminPosts.mockImplementationOnce(() => requestA.promise);
    for (const count of counts1) harness.api.getAdminPosts.mockImplementationOnce(() => count.promise);
    await flushEffects();
    for (const count of counts1) count.resolve(okPage([], 0));

    // The user switches to PUBLISHED: effects re-run (cleanups first).
    harness.search.value = new URLSearchParams("status=PUBLISHED");
    render();
    const requestB = deferred<ListResult>();
    const counts2 = [0, 1, 2, 3].map(() => deferred<ListResult>());
    harness.api.getAdminPosts.mockImplementationOnce(() => requestB.promise);
    for (const count of counts2) harness.api.getAdminPosts.mockImplementationOnce(() => count.promise);
    await flushEffects();
    for (const count of counts2) count.resolve(okPage([], 0));

    // The NEW condition's response arrives first…
    requestB.resolve(okPage(["新条件文章"]));
    await tick();
    let html = render();
    expect(html).toContain("新条件文章");

    // …then the stale DRAFT response lands LATE. It must not overwrite.
    requestA.resolve(okPage(["旧条件迟到文章"]));
    await tick();
    html = render();
    expect(html).toContain("新条件文章");
    expect(html).not.toContain("旧条件迟到文章");
  });
});
