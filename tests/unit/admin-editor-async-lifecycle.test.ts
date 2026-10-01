import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * B02 — delete / cache-retry responses must respect the editor's async
 * lifecycle: a response arriving after the page was left and re-initialized
 * (lifecycle generation bumped) never writes UI state and never navigates.
 * The save/changeStatus/createTag paths already had this guard (generation
 * capture + post-await check); delete and cache retry were the two unguarded
 * branches. Behavior is exercised through the same React-harness style as
 * admin-editor-seo-focus-behavior.test.ts, with one difference: the mock's
 * useLayoutEffect RUNS like useEffect here, because the lifecycle ref this
 * test drives is bumped inside a layout effect — replaying its cleanups is
 * exactly how "leave + re-initialize" is simulated.
 */

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  buttonHandlers: {} as Record<string, () => void | Promise<void>>,
  modalHandlers: {} as Record<string, () => void | Promise<void>>,
  retryHandler: null as null | (() => void | Promise<void>),
  retryRefreshing: false,
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
  api: {
    getAdminPost: vi.fn(),
    getAdminCategories: vi.fn(async () => ({ data: [], error: null, status: 200 })),
    getAdminTags: vi.fn(async () => ({ data: [], error: null, status: 200 })),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    createTag: vi.fn(),
    revalidatePublicCache: vi.fn(),
  },
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
    // Unlike the static-render harnesses, layout effects RUN here: the
    // lifecycle generation ref is bumped inside one, and replaying its
    // cleanup + effect is the "leave + re-initialize" simulation.
    useLayoutEffect(effect: () => void | (() => void)) { harness.effects.push(effect); },
    useCallback<T>(callback: T) { return callback; },
  };
});
vi.mock("@/components/ui/button", () => ({
  Button: (props: { children?: React.ReactNode; onClick?: () => void | Promise<void>; type?: string }) => {
    const label = Array.isArray(props.children)
      ? props.children.filter((child) => typeof child === "string").join("")
      : String(props.children ?? "");
    if (props.onClick) harness.buttonHandlers[label] = props.onClick;
    return createElement("button", { type: props.type ?? "button" }, props.children);
  },
}));
vi.mock("@/components/ui/modal", () => ({
  Modal: (props: { title?: string; onConfirm?: () => void | Promise<void> }) => {
    if (props.title && props.onConfirm) harness.modalHandlers[props.title] = props.onConfirm;
    return null;
  },
}));
vi.mock("@/components/views/admin/cache-refresh-warning", () => ({
  // B02 round 2 (166 review): the mock must NOT drop `refreshing` — the
  // disabled/label state of the retry button is exactly where the stuck
  // pending after hide/reveal showed up. It renders both now.
  CacheRefreshWarning: (props: { message?: string; onRetry: () => void | Promise<void>; refreshing?: boolean }) => {
    harness.retryHandler = props.onRetry;
    harness.retryRefreshing = !!props.refreshing;
    return createElement(
      "div",
      { "data-test": "cache-warning" },
      props.message ?? "",
      createElement(
        "button",
        { type: "button", disabled: props.refreshing || undefined, "data-test": "cache-retry" },
        props.refreshing ? "正在刷新…" : "重试公开内容刷新",
      ),
    );
  },
}));
const api = harness.api;
vi.mock("@/lib/client-api", () => ({
  isAuthFailure: () => false,
  clientApi: harness.api,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/admin/posts/p-1/edit",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminEditorView } from "@/components/views/admin/admin-editor-view";

const ARCHIVED_POST = {
  id: "p-1",
  title: "已归档文章",
  slug: "archived-b02",
  excerpt: "摘要",
  contentMd: "正文",
  status: "ARCHIVED" as const,
  publishedAt: "2026-09-01T00:00:00.000Z",
  version: 7,
  categoryId: null,
  tagIds: [] as string[],
  seoTitle: null,
  seoDescription: null,
  coverImageUrl: null,
  seoImageUrl: null,
};

let lastHtml = "";

beforeEach(() => {
  vi.clearAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  harness.buttonHandlers = {};
  harness.modalHandlers = {};
  harness.retryHandler = null;
  harness.retryRefreshing = false;
  lastHtml = "";
  vi.stubGlobal("document", {
    getElementById: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("HTMLElement", class FakeHTMLElement {});
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: vi.fn(),
    location: { href: "http://localhost/admin/posts/p-1/edit", pathname: "/admin/posts/p-1/edit" },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function render() {
  harness.cursor = 0;
  lastHtml = renderToStaticMarkup(createElement(AdminEditorView, { postId: "p-1" }));
  return lastHtml;
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

/** Mount the editor with the archived post loaded; returns nothing. */
async function renderLoadedEditor() {
  api.getAdminPost.mockResolvedValue({ data: ARCHIVED_POST, error: null, status: 200 });
  render();
  await flushEffects();
  const html = render();
  expect(html).toContain("删除文章");
  expect(harness.modalHandlers["确认删除已归档文章？"]).toBeTruthy();
}

/** Leave + re-initialize: replay layout-effect cleanups, then effects again.
 * With cacheComponents the real event is an Activity HIDE (state retained,
 * effects torn down) followed by reveal (effects re-run) — exactly what this
 * replay models since the fake useState store is never reset here. */
async function leaveAndReinitialize() {
  await flushEffects();
}

describe("AdminEditorView async lifecycle (B02)", () => {
  it("a delete response arriving after leave/re-init does not navigate or enter the deleted screen", async () => {
    await renderLoadedEditor();
    let resolveDelete!: (value: unknown) => void;
    api.deletePost.mockImplementation(
      () => new Promise((resolve) => { resolveDelete = resolve; }),
    );

    void harness.modalHandlers["确认删除已归档文章？"]!();
    expect(api.deletePost).toHaveBeenCalledTimes(1);

    // The page is left and re-initialized while the delete is in flight.
    await leaveAndReinitialize();

    resolveDelete({ error: null, cacheStatus: "invalidated" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.router.replace).not.toHaveBeenCalled();
    const html = render();
    expect(html).not.toContain("文章已删除");
  });

  it("a delete response while still current navigates to the list (guard does not over-block)", async () => {
    await renderLoadedEditor();
    api.deletePost.mockResolvedValue({ error: null, cacheStatus: "invalidated" });

    void harness.modalHandlers["确认删除已归档文章？"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.router.replace).toHaveBeenCalledWith("/admin/posts");
  });

  it("a cache-retry response arriving after leave/re-init does not navigate and keeps the warning", async () => {
    await renderLoadedEditor();
    // First: a current-generation delete whose cache refresh FAILED → the
    // page enters the locked post-delete screen with the retry warning.
    api.deletePost.mockResolvedValue({ error: null, cacheStatus: "failed" });
    void harness.modalHandlers["确认删除已归档文章？"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render()).toContain("文章已删除");
    expect(harness.retryHandler).toBeTruthy();

    let resolveRetry!: (value: unknown) => void;
    api.revalidatePublicCache.mockImplementation(
      () => new Promise((resolve) => { resolveRetry = resolve; }),
    );
    void harness.retryHandler!();

    // Leave + re-initialize while the retry is in flight.
    await leaveAndReinitialize();

    resolveRetry({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(render()).toContain("cache-warning");
  });

  it("a current-generation cache-retry success finishes the deferred navigation", async () => {
    await renderLoadedEditor();
    api.deletePost.mockResolvedValue({ error: null, cacheStatus: "failed" });
    void harness.modalHandlers["确认删除已归档文章？"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render()).toContain("文章已删除");
    expect(harness.retryHandler).toBeTruthy();

    api.revalidatePublicCache.mockResolvedValue({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    void harness.retryHandler!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.router.replace).toHaveBeenCalledWith("/admin/posts");
  });

  it("B02 round 2: a retry pending across hide/reveal is NOT left stuck (pending cleared, warning kept)", async () => {
    await renderLoadedEditor();
    api.deletePost.mockResolvedValue({ error: null, cacheStatus: "failed" });
    void harness.modalHandlers["确认删除已归档文章？"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render()).toContain("文章已删除");
    expect(harness.retryHandler).toBeTruthy();
    expect(harness.retryRefreshing).toBe(false);

    let resolveRetry!: (value: unknown) => void;
    api.revalidatePublicCache.mockImplementation(
      () => new Promise((resolve) => { resolveRetry = resolve; }),
    );
    void harness.retryHandler!();
    // In flight: the retry button is disabled and shows its busy label.
    const inFlightHtml = render();
    expect(harness.retryRefreshing).toBe(true);
    expect(inFlightHtml).toContain("正在刷新…");
    expect(inFlightHtml).toContain('disabled=""');

    // Activity hide → reveal while the response is still in flight.
    await leaveAndReinitialize();
    resolveRetry({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale response kept the warning; the pending flag was released by
    // the hide cleanup, so the revealed page can retry again (166 B02: the
    // button used to stay disabled forever with the handler refusing entry).
    const html = render();
    expect(html).toContain("cache-warning");
    expect(harness.retryRefreshing).toBe(false);
    expect(html).toContain("重试公开内容刷新");
    expect(html).not.toContain('disabled=""');
    expect(harness.router.replace).not.toHaveBeenCalled();

    // And the handler accepts a second retry.
    api.revalidatePublicCache.mockResolvedValue({ data: { cacheStatus: "failed" }, error: null, status: 200 });
    void harness.retryHandler!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);
  });

  /**
   * R1 (177): the UI-disabled evidence in admin-editor-activity.test.ts shows
   * React suppressing clicks on disabled controls; this harness instead calls
   * the CAPTURED product handlers DIRECTLY (bypassing the DOM entirely) while
   * the shared busy gate is held — proving the handler-level gate itself
   * refuses the write, not just the disabled attribute. Only <Button>-based
   * controls are captured here; the raw <button> entries (归档/删除文章/inline
   * tag 确定) cannot be captured by this harness — their gates are proven by
   * the real-UI disabled + idle-enabled-path evidence in the Activity suite
   * (gate scenarios DRAFT/PUBLISHED/ARCHIVED and tests E / tag ownership).
   */
  it("R1: direct handler invocations during an in-flight refresh issue no business request (handler-level gate)", async () => {
    await renderLoadedEditor();

    // Producing save (ARCHIVED post) with a failed cache refresh → warning.
    api.updatePost.mockResolvedValue({
      data: { ...ARCHIVED_POST, version: ARCHIVED_POST.version + 1 },
      error: null, status: 200, cacheStatus: "failed",
    });
    void harness.buttonHandlers["保存更新"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render()).toContain("公开内容刷新失败");
    expect(api.updatePost).toHaveBeenCalledTimes(1);
    expect(harness.retryHandler).toBeTruthy();

    let resolveRetry!: (value: unknown) => void;
    api.revalidatePublicCache.mockImplementation(
      () => new Promise((resolve) => { resolveRetry = resolve; }),
    );
    void harness.retryHandler!();
    render();
    expect(harness.retryRefreshing).toBe(true);

    // Direct handler-level invocations while the refresh holds busy: the
    // gate itself must refuse every business write (no DOM disabled help).
    void harness.buttonHandlers["保存更新"]!();
    void harness.buttonHandlers["恢复为草稿"]!();
    void harness.retryHandler!(); // double retry refused as well
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.updatePost).toHaveBeenCalledTimes(1); // only the producing save
    expect(api.deletePost).not.toHaveBeenCalled();
    expect(api.createTag).not.toHaveBeenCalled();
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);
    expect(harness.router.replace).not.toHaveBeenCalled();

    // And the reverse direction: a pending WRITE blocks a direct retry call.
    resolveRetry({ data: { cacheStatus: "failed" }, error: null, status: 200 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    render();
    expect(harness.retryRefreshing).toBe(false);

    let resolveSave!: (value: unknown) => void;
    api.updatePost.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );
    void harness.buttonHandlers["保存更新"]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    void harness.retryHandler!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1); // still blocked
    resolveSave({ data: { ...ARCHIVED_POST, version: ARCHIVED_POST.version + 2 }, error: null, status: 200, cacheStatus: "failed" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.updatePost).toHaveBeenCalledTimes(2);
  });
});
