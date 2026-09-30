import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * FR-09 behavioral state-machine test (Codex review round 1): drives the REAL
 * AdminDashboardView loaders through controllable request outcomes and asserts
 * the rendered stat markup after each round — success → network failure
 * (stale-kept old value) → retry success, plus the 401 masking path. This is
 * a state/DOM-assertion test, not a pure-function or source-string check.
 */

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  api: {
    posts: vi.fn(),
    categories: vi.fn(),
    tags: vi.fn(),
  },
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
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
  clientApi: {
    getAdminPosts: harness.api.posts,
    getAdminCategories: harness.api.categories,
    getAdminTags: harness.api.tags,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminDashboardView } from "@/components/views/admin/admin-dashboard-view";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

type ApiResult = { data: unknown; meta?: { total: number; totalPages: number }; error: string | null; status: number; errorCode?: string };

const okList = (items: unknown[], total: number): ApiResult =>
  ({ data: items, meta: { total, totalPages: Math.max(1, Math.ceil(total / 20)) }, error: null, status: 200 });
const networkDown: ApiResult = { data: null, error: "网络请求失败，请检查连接后重试", status: 0, errorCode: "NETWORK_ERROR" };
const authDead: ApiResult = { data: null, error: "登录状态已失效", status: 401, errorCode: "AUTH_REQUIRED" };

function render() {
  harness.cursor = 0;
  return renderToStaticMarkup(createElement(AdminDashboardView));
}

/** Runs pending effects (their cleanups first, like React on dep change). */
async function flushEffects() {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  const fns = harness.effects.splice(0);
  for (const fn of fns) {
    const cleanup = fn();
    if (typeof cleanup === "function") harness.cleanups.push(cleanup);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** One full read round: render, run loaders, resolve their requests, re-render. */
async function readRound(outcomes: { posts?: ApiResult; categories?: ApiResult; tags?: ApiResult }) {
  // Drop the mount effect queued by the previous round's final render so
  // exactly ONE loader run happens per round.
  harness.effects = [];
  harness.cleanups = [];
  render();
  const postsDeferred = deferred<ApiResult>();
  const categoriesDeferred = deferred<ApiResult>();
  const tagsDeferred = deferred<ApiResult>();
  harness.api.posts.mockReturnValueOnce(postsDeferred.promise);
  harness.api.categories.mockReturnValueOnce(categoriesDeferred.promise);
  harness.api.tags.mockReturnValueOnce(tagsDeferred.promise);
  await flushEffects(); // loaders start and grab the pending promises
  postsDeferred.resolve(outcomes.posts ?? okList([], 0));
  categoriesDeferred.resolve(outcomes.categories ?? okList([], 0));
  tagsDeferred.resolve(outcomes.tags ?? okList([], 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return render();
}

const POST = (title: string) => ({ id: title, title, slug: title, status: "DRAFT", updatedAt: "2026-09-30T00:00:00Z", category: null });

beforeEach(() => {
  vi.clearAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
});

describe("AdminDashboardView read state machine (FR-09, Codex round 1)", () => {
  it("success → network failure keeps the OLD values with a staleness marker; the other resources stay clean (AC-09-02/04)", async () => {
    const round1 = await readRound({
      posts: okList([POST("甲"), POST("乙")], 7),
      categories: okList([{}, {}, {}, {}, {}], 5),
      tags: okList([{}, {}, {}, {}, {}, {}, {}, {}], 8),
    });
    expect(round1).toMatch(/>7</);
    expect(round1).toMatch(/>5</);
    expect(round1).toMatch(/>8</);
    expect(round1).not.toContain("数据可能不是最新");
    expect(round1).not.toContain("暂无法获取");

    // Retry: posts hits a network failure, categories/tags succeed again.
    const round2 = await readRound({
      posts: networkDown,
      categories: okList([{}, {}, {}, {}, {}], 5),
      tags: okList([{}, {}, {}, {}, {}, {}, {}, {}], 8),
    });
    // The posts card keeps its last confirmed value (7) WITH the marker…
    expect(round2).toMatch(/>7</);
    expect(round2).toContain("数据可能不是最新");
    expect(round2).toContain("以下为上次成功读取的文章");
    // …while the other two resources never report failures (partial failure
    // does not erase their successes).
    expect(round2).toMatch(/>5</);
    expect(round2).toMatch(/>8</);
    expect(round2).not.toContain("暂无法获取");
  });

  it("stale network failure → retry success clears every failure marker (AC-09-04)", async () => {
    await readRound({ posts: okList([POST("甲")], 7), categories: okList([{}], 5), tags: okList([{}], 8) });
    const failed = await readRound({ posts: networkDown, categories: okList([{}], 5), tags: okList([{}], 8) });
    expect(failed).toContain("数据可能不是最新");
    const recovered = await readRound({ posts: okList([POST("甲"), POST("乙"), POST("丙")], 9), categories: okList([{}], 5), tags: okList([{}], 8) });
    expect(recovered).not.toContain("数据可能不是最新");
    expect(recovered).not.toContain("以下为上次成功读取");
    expect(recovered).toMatch(/>9</);
  });

  it("a server-class failure (5xx) after success is stale-kept; a non-network 4xx failure hides the values instead", async () => {
    await readRound({ posts: okList([POST("甲")], 7), categories: okList([{}], 5), tags: okList([{}], 8) });
    const serverDown = await readRound({
      posts: { data: null, error: "服务器内部错误", status: 500, errorCode: "INTERNAL_ERROR" },
      categories: okList([{}], 5),
      tags: okList([{}], 8),
    });
    expect(serverDown).toMatch(/>7</);
    expect(serverDown).toContain("数据可能不是最新");
    const clientError = await readRound({
      posts: { data: null, error: "请求失败 (404)", status: 404, errorCode: "HTTP_ERROR" },
      categories: okList([{}], 5),
      tags: okList([{}], 8),
    });
    expect(clientError).toContain("暂无法获取");
    expect(clientError).not.toContain("数据可能不是最新");
    expect(clientError).not.toMatch(/>7</);
  });

  it("the total stays metadata-driven: success with no meta renders the unknown marker, never a list length (AC-09-03)", async () => {
    const html = await readRound({
      posts: { data: [POST("甲"), POST("乙")], error: null, status: 200 },
      categories: okList([{}], 0),
      tags: okList([{}], 0),
    });
    expect(html).toContain("总数未知");
    expect(html).not.toMatch(/>2</);
  });

  it("a 401 masks every stat and the recent list behind the re-login screen (FR-09.5)", async () => {
    const html = await readRound({ posts: authDead, categories: authDead, tags: authDead });
    expect(html).toContain("登录状态已失效");
    expect(html).toContain("重新登录");
    expect(html).not.toContain("文章总数");
    expect(html).not.toContain("最近更新");
  });
});
