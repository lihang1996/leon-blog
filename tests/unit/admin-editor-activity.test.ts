// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { Activity, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * B02 round 2 — REAL React/Activity behavior tests (Codex review 166).
 *
 * The project runs with `cacheComponents: true`, so Next.js keeps routes
 * mounted inside React's <Activity mode="hidden"> on soft navigation
 * (node_modules/next/dist/docs "preserving-ui-state"): state survives, but
 * effects tear down and re-run. These tests drive the REAL EditorForm with
 * real react-dom (jsdom) under a toggled <Activity> to prove:
 *
 *   A. a cache refresh pending across hide/reveal can be retried again
 *      (the pending flag is cleared by the hide cleanup — not stuck);
 *   B. a response landing while hidden writes nothing (warning kept, no
 *      navigation, no success feedback);
 *   C. cache refresh and business writes share ONE serial gate — a save
 *      during an in-flight refresh is refused (button disabled + handler
 *      gate), so a late refresh success can never clear a newer warning;
 *   D. an old refresh resolving after hide→reveal→new-write keeps the new
 *      write's warning and feedback;
 *   E. the locked post-delete screen gets the same hide/reveal retry back;
 *   F. a refresh cannot start while a business write is in flight.
 *
 * The previous fake-React harness (admin-editor-async-lifecycle.test.ts)
 * dropped the refreshing/disabled props and could not distinguish hide from
 * unmount, which is why the stuck button went unnoticed.
 */

const api = vi.hoisted(() => ({
  getAdminPost: vi.fn(),
  getAdminCategories: vi.fn(async () => ({ data: [] as Array<{ id: string; name: string; slug: string }>, error: null, status: 200 })),
  getAdminTags: vi.fn(async () => ({ data: [] as Array<{ id: string; name: string; slug: string }>, error: null, status: 200 })),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  createTag: vi.fn(),
  revalidatePublicCache: vi.fn(),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/client-api", () => ({
  isAuthFailure: () => false,
  clientApi: api,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin/posts/p-1/edit",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminEditorView } from "@/components/views/admin/admin-editor-view";

const DRAFT_POST = {
  id: "p-1",
  title: "行为测试文章",
  slug: "activity-draft",
  excerpt: "摘要",
  contentMd: "# 正文",
  status: "DRAFT" as "DRAFT" | "ARCHIVED" | "PUBLISHED",
  publishedAt: null as string | null,
  version: 5,
  categoryId: null,
  tagIds: [] as string[],
  seoTitle: null,
  seoDescription: null,
  coverImageUrl: null,
  seoImageUrl: null,
};

type EditorPost = typeof DRAFT_POST;

const ARCHIVED_POST: EditorPost = { ...DRAFT_POST, title: "已归档文章", status: "ARCHIVED" };

const PUBLISHED_POST: EditorPost = {
  ...DRAFT_POST,
  title: "已发布文章",
  status: "PUBLISHED",
  publishedAt: "2026-09-01T00:00:00.000Z",
};

function savedPost(base: EditorPost) {
  return { ...base, version: base.version + 1 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function buttons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button"));
}

function findButton(container: HTMLElement, text: string) {
  const match = buttons(container).find((b) => (b.textContent ?? "").includes(text));
  if (!match) throw new Error(`button containing "${text}" not found; had: ${buttons(container).map((b) => b.textContent).join(" | ")}`);
  return match;
}

function hasText(container: HTMLElement, text: string) {
  return container.textContent?.includes(text) ?? false;
}

let container: HTMLDivElement;
let root: Root | null = null;
// Externally controlled <Activity> wrapper: the state setter is exposed via a
// mutable object, assigned inside an effect (render-time outer mutation is
// forbidden by the react-compiler lint rule). No cleanup-nulling: the setter
// stays usable while the subtree is Activity-hidden (state setters remain
// valid when effects are torn down).
const activityControls: { setHidden: ((hidden: boolean) => void) | null } = { setHidden: null };

function EditorActivity() {
  const [hidden, setHiddenState] = React.useState(false);
  React.useEffect(() => {
    activityControls.setHidden = setHiddenState;
  }, [setHiddenState]);
  return createElement(
    Activity,
    { mode: hidden ? ("hidden" as const) : ("visible" as const) } as React.ActivityProps,
    createElement(AdminEditorView, { postId: "p-1" }),
  );
}

async function mountEditor() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(EditorActivity));
  });
  await act(async () => { await flush(); });
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function setHiddenMode(hidden: boolean) {
  await act(async () => {
    activityControls.setHidden!(hidden);
    await flush();
  });
}

/** Loads the post, saves once with a failed cache refresh → warning shown. */
async function arriveAtWarning(post: EditorPost) {
  api.getAdminPost.mockResolvedValue({ data: post, error: null, status: 200 });
  await mountEditor();
  api.updatePost.mockResolvedValue({
    data: savedPost(post), error: null, status: 200, cacheStatus: "failed",
  });
  await click(findButton(container, post.status === "DRAFT" ? "保存草稿" : "保存更新"));
  expect(hasText(container, "公开内容刷新失败")).toBe(true);
  return findButton(container, "重试公开内容刷新");
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  window.sessionStorage.clear();
});
afterEach(() => {
  if (root) {
    act(() => { root!.unmount(); });
    root = null;
  }
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

describe("AdminEditorView under <Activity> hide/reveal (B02 round 2)", () => {
  it("keeps the Activity contract the fix relies on: hide runs layout cleanups, reveal re-runs effects, state survives", async () => {
    const events: string[] = [];
    const controls: { hide: ((v: boolean) => void) | null } = { hide: null };
    function Probe() {
      const [n, setN] = React.useState(1);
      const gen = React.useRef(0);
      React.useLayoutEffect(() => {
        gen.current += 1;
        events.push(`effect:${gen.current}`);
        return () => {
          gen.current += 1;
          setN(0); // transient-state reset from the cleanup, like the fix
          events.push(`cleanup:${gen.current}`);
        };
      }, []);
      return createElement("button", { onClick: () => setN((v) => v + 1) }, `n=${n}`);
    }
    function Wrap() {
      const [hidden, setHiddenState] = React.useState(false);
      React.useEffect(() => {
        controls.hide = setHiddenState;
      }, [setHiddenState]);
      return createElement(
        Activity,
        { mode: hidden ? "hidden" : "visible" } as React.ActivityProps,
        createElement(Probe),
      );
    }
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Wrap));
    });
    const probe = findButton(container, "n=");
    expect(probe.textContent).toBe("n=1");
    await act(async () => { controls.hide!(true); await flush(); });
    // Hide tore the effects down and the cleanup's transient reset applied
    // while hidden — the DOM/state itself was preserved (same element).
    expect(events).toEqual(["effect:1", "cleanup:2"]);
    expect(probe.textContent).toBe("n=0");
    await act(async () => { controls.hide!(false); await flush(); });
    expect(events).toEqual(["effect:1", "cleanup:2", "effect:3"]);
    act(() => { root!.unmount(); });
    root = null;
  });

  it("A+D: a cache refresh pending across hide/reveal is retryable again and its late success keeps the newer write's warning", async () => {
    const retry = await arriveAtWarning(DRAFT_POST);
    const refresh = deferred<{ data: { cacheStatus: string }; error: null; status: number }>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);

    await click(retry);
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);
    expect(findButton(container, "正在刷新…").disabled).toBe(true);

    // Hide while the refresh is in flight (soft navigation / bfcache).
    await setHiddenMode(true);

    // The response lands while hidden: it must not touch the hidden page.
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
      await flush();
    });
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(hasText(container, "公开内容刷新成功")).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();

    // Reveal: the retry must be usable again (166 B02: was stuck disabled).
    await setHiddenMode(false);
    const retryAfterReveal = findButton(container, "重试公开内容刷新");
    expect(retryAfterReveal.disabled).toBe(false);

    // A NEW write lands first (cache refresh failed again) …
    api.updatePost.mockResolvedValue({
      data: savedPost({ ...DRAFT_POST, version: 6 }), error: null, status: 200, cacheStatus: "failed",
    });
    await click(findButton(container, "保存草稿"));
    expect(api.updatePost).toHaveBeenCalledTimes(2);
    expect(hasText(container, "文章已保存")).toBe(true);
    expect(hasText(container, "公开内容刷新失败")).toBe(true);

    // … then a second refresh, whose success may clear only its own warning.
    api.revalidatePublicCache.mockResolvedValue({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    await click(findButton(container, "重试公开内容刷新"));
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);
    expect(hasText(container, "公开内容刷新成功")).toBe(true);
    expect(hasText(container, "公开内容刷新失败")).toBe(false);
  });

  it("B: a refresh resolving while hidden keeps the warning (no state writes from the stale response)", async () => {
    const retry = await arriveAtWarning(DRAFT_POST);
    const refresh = deferred<{ data: { cacheStatus: string }; error: null; status: number }>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);
    await click(retry);

    await setHiddenMode(true);
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
      await flush();
    });

    expect(router.replace).not.toHaveBeenCalled();
    expect(hasText(container, "公开内容刷新成功")).toBe(false);

    await setHiddenMode(false);
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(findButton(container, "重试公开内容刷新").disabled).toBe(false);
  });

  it("B(failed variant): a refresh FAILING while hidden keeps the warning and stays retryable", async () => {
    const retry = await arriveAtWarning(DRAFT_POST);
    const refresh = deferred<{ data: { cacheStatus: string }; error: null; status: number }>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);
    await click(retry);

    await setHiddenMode(true);
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "failed" }, error: null, status: 200 });
      await flush();
    });
    await setHiddenMode(false);

    // The hidden failure must not have produced a NEWER-looking error
    // feedback on the revealed page, and retrying stays possible.
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(findButton(container, "重试公开内容刷新").disabled).toBe(false);
  });

  it("C: cache refresh and business writes share one serial gate — no save during an in-flight refresh", async () => {
    const retry = await arriveAtWarning(DRAFT_POST);
    const refresh = deferred<{ data: { cacheStatus: string }; error: null; status: number }>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);

    await click(retry);

    // While the refresh is in flight the save control is disabled AND the
    // handler refuses the write (166 B02: the old code let a save interleave,
    // then the refresh's late success cleared the save's newer warning).
    const save = findButton(container, "保存草稿");
    expect(save.disabled).toBe(true);
    await click(save);
    expect(api.updatePost).toHaveBeenCalledTimes(1); // only the original save

    // The refresh fails late; the warning stays; saving works afterwards.
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "failed" }, error: null, status: 200 });
      await flush();
    });
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(findButton(container, "重试公开内容刷新").disabled).toBe(false);
  });

  it("F: a refresh cannot start while a business write is in flight", async () => {
    api.getAdminPost.mockResolvedValue({ data: DRAFT_POST, error: null, status: 200 });
    await mountEditor();

    const save = deferred<{ data: EditorPost; error: null; status: number; cacheStatus: string }>();
    api.updatePost.mockImplementation(() => save.promise);
    await click(findButton(container, "保存草稿"));

    // The warning is not rendered yet (save not confirmed), so drive the gate
    // through the retry path once the save lands with a failed refresh.
    await act(async () => {
      save.resolve({ data: savedPost(DRAFT_POST), error: null, status: 200, cacheStatus: "failed" });
      await flush();
    });
    // The save's failed refresh produced the warning: the retry control is
    // present and idle before the second write starts.
    expect(findButton(container, "重试公开内容刷新").disabled).toBe(false);

    const secondSave = deferred<{ data: EditorPost; error: null; status: number; cacheStatus: string }>();
    api.updatePost.mockImplementation(() => secondSave.promise);
    await click(findButton(container, "保存草稿"));
    // The refresh control stays disabled for the whole duration of the write
    // (its label flips to 正在刷新… while `saving` holds the shared gate), and
    // a click anyway must not start a refresh.
    const retryDuringWrite = container.querySelector<HTMLButtonElement>('div[role="alert"] button');
    expect(retryDuringWrite).not.toBeNull();
    expect(retryDuringWrite!.disabled).toBe(true);
    await click(retryDuringWrite!);
    expect(api.revalidatePublicCache).not.toHaveBeenCalled();
    await act(async () => {
      secondSave.resolve({ data: savedPost({ ...DRAFT_POST, version: 6 }), error: null, status: 200, cacheStatus: "failed" });
      await flush();
    });
    expect(api.revalidatePublicCache).not.toHaveBeenCalled();
  });

  it("E: the locked post-delete screen regains its retry after hide/reveal; the hidden response never navigates", async () => {
    await arriveAtWarning(ARCHIVED_POST);
    expect(hasText(container, "文章已删除")).toBe(false); // sanity: normal editor screen

    // Hard-delete with a failed cache refresh → locked post-delete screen.
    api.deletePost.mockResolvedValue({ data: null as unknown as void, error: null, status: 204, cacheStatus: "failed" });
    await click(findButton(container, "删除文章"));
    await click(findButton(container, "确认删除"));
    expect(hasText(container, "文章已删除")).toBe(true);
    const screenRetry = findButton(container, "重试公开内容刷新");
    expect(screenRetry.disabled).toBe(false);

    const refresh = deferred<{ data: { cacheStatus: string }; error: null; status: number }>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);
    await click(screenRetry);
    expect(findButton(container, "正在刷新…").disabled).toBe(true);

    await setHiddenMode(true);
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
      await flush();
    });
    expect(router.replace).not.toHaveBeenCalled();

    await setHiddenMode(false);
    // Retry is usable again on the revealed locked screen.
    const retryAfterReveal = findButton(container, "重试公开内容刷新");
    expect(retryAfterReveal.disabled).toBe(false);
    api.revalidatePublicCache.mockResolvedValue({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    await click(retryAfterReveal);
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenCalledWith("/admin/posts");
  });
});

/**
 * R1 (177 §3): the stale-response ordering 166/176 asked for and the first
 * round could not prove — an OLD refresh settling LAST must not overwrite the
 * NEW page's state, and its finally must not release a NEW request's busy.
 * Matrix dimensions: the NEW write's cache result × the OLD refresh's outcome
 * (including a rejected promise).
 */
type RefreshOutcome = "invalidated" | "failed" | "reject";
type CacheResult = "failed" | "unknown" | "invalidated";

function settleRefresh(
  d: { resolve: (value: unknown) => void },
  outcome: RefreshOutcome,
): Promise<void> {
  return act(async () => {
    if (outcome === "reject") d.resolve(Promise.reject(new Error("stale network failure")));
    else if (outcome === "failed") d.resolve({ data: { cacheStatus: "failed" }, error: null, status: 200 });
    else d.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
    await flush();
  });
}

/** Performs one confirmed save whose cache result is `result` (unknown = no header). */
async function saveWithCacheResult(post: EditorPost, result: CacheResult) {
  api.updatePost.mockResolvedValue({
    data: savedPost(post),
    error: null,
    status: 200,
    ...(result === "unknown" ? {} : { cacheStatus: result }),
  });
  await click(findButton(container, post.status === "DRAFT" ? "保存草稿" : "保存更新"));
}

function expectNoticeState(result: CacheResult) {
  const failed = hasText(container, "公开内容刷新失败");
  const unknown = hasText(container, "公开缓存状态未知");
  if (result === "failed") {
    expect(failed).toBe(true);
    expect(unknown).toBe(false);
  } else if (result === "unknown") {
    expect(unknown).toBe(true);
    expect(failed).toBe(false);
  } else {
    expect(failed).toBe(false);
    expect(unknown).toBe(false);
  }
}

/** Hide → reveal while the given deferred refresh stays pending. */
async function hideRevealAroundPendingRefresh() {
  const refresh = deferred<unknown>();
  api.revalidatePublicCache.mockImplementation(() => refresh.promise);
  await click(findButton(container, "重试公开内容刷新"));
  expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);
  await setHiddenMode(true);
  await setHiddenMode(false);
  return refresh;
}

describe("AdminEditorView stale-response ownership (R1 / 177)", () => {
  for (const newResult of ["failed", "unknown", "invalidated"] as const) {
    for (const oldOutcome of ["invalidated", "failed", "reject"] as const) {
      it(`an old refresh (${oldOutcome}) settling AFTER a new save (cache=${newResult}) overwrites nothing`, async () => {
        await arriveAtWarning(DRAFT_POST);
        const oldRefresh = await hideRevealAroundPendingRefresh();

        // The NEW write completes first, producing the newResult cache state.
        await saveWithCacheResult(DRAFT_POST, newResult);
        expect(api.updatePost).toHaveBeenCalledTimes(2);
        expect(hasText(container, "文章已保存")).toBe(true);
        expectNoticeState(newResult);

        // The OLD refresh settles last: no notice/feedback overwrite, no
        // navigation, and no extra refresh request.
        await settleRefresh(oldRefresh, oldOutcome);
        expectNoticeState(newResult);
        expect(hasText(container, "文章已保存")).toBe(true);
        expect(hasText(container, "公开内容刷新成功")).toBe(false);
        expect(hasText(container, "公开内容刷新仍未成功")).toBe(false);
        expect(router.replace).not.toHaveBeenCalled();
        expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);

        // Retryability: with a live warning the control is usable again.
        if (newResult !== "invalidated") {
          const retry = findButton(container, "重试公开内容刷新");
          expect(retry.disabled).toBe(false);
          api.revalidatePublicCache.mockResolvedValue({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
          await click(retry);
          expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);
        }
      });
    }
  }

  for (const oldOutcome of ["invalidated", "failed", "reject"] as const) {
    it(`an old refresh (${oldOutcome}) finally does not release a NEW refresh's pending (busy kept)`, async () => {
      await arriveAtWarning(DRAFT_POST);
      const oldRefresh = await hideRevealAroundPendingRefresh();

      // A NEW refresh starts (and stays pending) on the revealed page.
      const newRefresh = deferred<unknown>();
      api.revalidatePublicCache.mockImplementation(() => newRefresh.promise);
      await click(findButton(container, "重试公开内容刷新"));
      expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);
      expect(findButton(container, "正在刷新…").disabled).toBe(true);

      // The OLD response settles in between — the new pending must survive.
      await settleRefresh(oldRefresh, oldOutcome);
      expect(findButton(container, "正在刷新…").disabled).toBe(true);
      expect(hasText(container, "公开内容刷新失败")).toBe(true);
      expect(hasText(container, "公开内容刷新成功")).toBe(false);
      expect(hasText(container, "公开内容刷新仍未成功")).toBe(false);
      expect(router.replace).not.toHaveBeenCalled();
      expect(api.revalidatePublicCache).toHaveBeenCalledTimes(2);

      // The NEW refresh finishes on its own terms.
      await act(async () => {
        newRefresh.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
        await flush();
      });
      expect(hasText(container, "公开内容刷新成功")).toBe(true);
      expect(hasText(container, "公开内容刷新失败")).toBe(false);
      // Success cleared the warning, so the retry control is gone entirely.
      expect(buttons(container).some((b) => (b.textContent ?? "").includes("重试公开内容刷新"))).toBe(false);
    });
  }

  it("an old refresh settling while a NEW write is pending does not release the write's busy", async () => {
    await arriveAtWarning(DRAFT_POST);
    const oldRefresh = await hideRevealAroundPendingRefresh();

    // A NEW save starts and stays pending on the revealed page.
    const newSave = deferred<unknown>();
    api.updatePost.mockImplementation(() => newSave.promise);
    const saveButton = findButton(container, "保存草稿");
    await click(saveButton);
    expect(api.updatePost).toHaveBeenCalledTimes(2);
    expect(findButton(container, "保存草稿").disabled).toBe(true);

    // The OLD refresh settles last: the write keeps its busy/pending state.
    await settleRefresh(oldRefresh, "invalidated");
    expect(findButton(container, "保存草稿").disabled).toBe(true);
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(hasText(container, "公开内容刷新成功")).toBe(false);
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);

    // The NEW write finishes with its own failed refresh → its warning stays.
    await act(async () => {
      newSave.resolve({ data: savedPost(DRAFT_POST), error: null, status: 200, cacheStatus: "failed" });
      await flush();
    });
    expect(hasText(container, "文章已保存")).toBe(true);
    expect(hasText(container, "公开内容刷新失败")).toBe(true);
    expect(findButton(container, "保存草稿").disabled).toBe(false);
  });

  it("ownership path: a warning raised by a STATUS action (archive) follows the same rules", async () => {
    api.getAdminPost.mockResolvedValue({ data: PUBLISHED_POST, error: null, status: 200 });
    await mountEditor();

    // Archive (status transition) with a failed refresh → archive warning.
    api.updatePost.mockResolvedValue({
      data: { ...savedPost(PUBLISHED_POST), status: "ARCHIVED" as const },
      error: null, status: 200, cacheStatus: "failed",
    });
    await click(findButton(container, "归档"));
    await click(findButton(container, "确认归档"));
    expect(hasText(container, "文章已归档，但公开内容刷新失败")).toBe(true);

    const oldRefresh = await hideRevealAroundPendingRefresh();

    // A new content save (still ARCHIVED → 保存更新) lands its own warning.
    api.updatePost.mockResolvedValue({
      data: savedPost({ ...ARCHIVED_POST, version: PUBLISHED_POST.version + 1 }),
      error: null, status: 200, cacheStatus: "unknown",
    });
    await click(findButton(container, "保存更新"));
    expect(hasText(container, "公开缓存状态未知")).toBe(true);

    await settleRefresh(oldRefresh, "invalidated");
    // The stale archive-era refresh cleared neither the new notice nor the
    // new write's feedback, and navigated nowhere.
    expect(hasText(container, "公开缓存状态未知")).toBe(true);
    expect(hasText(container, "公开内容刷新成功")).toBe(false);
    expect(hasText(container, "文章已保存")).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);
  });

  it("ownership path: a warning raised by an inline TAG creation follows the same rules", async () => {
    // Production-shaped tag options: once a tag is created the server knows
    // it, so the options effect's re-fetch on Activity reveal still returns
    // the new tag (a bare [] mock would hide the chip and prove nothing).
    const serverTags: Array<{ id: string; name: string; slug: string }> = [];
    api.getAdminTags.mockImplementation(async () => ({ data: [...serverTags], error: null, status: 200 }));
    api.getAdminPost.mockResolvedValue({ data: DRAFT_POST, error: null, status: 200 });
    await mountEditor();

    // Create a tag through the real inline form; its refresh fails.
    await click(findButton(container, "+ 添加标签"));
    const input = container.querySelector('input[aria-label="新标签名"]');
    expect(input).not.toBeNull();
    const inputElement = input as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(inputElement, "回归标签");
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      await flush();
    });
    api.createTag.mockResolvedValue({
      data: { id: "tag-9", name: "回归标签", slug: "tag-9" },
      error: null, status: 201, cacheStatus: "failed",
    });
    await click(findButton(container, "确定"));
    serverTags.push({ id: "tag-9", name: "回归标签", slug: "tag-9" });
    expect(hasText(container, "标签已创建，但公开内容刷新失败")).toBe(true);
    expect(hasText(container, "回归标签")).toBe(true);

    const oldRefresh = await hideRevealAroundPendingRefresh();

    // A new save lands a save-kind warning; the tag chip survives the
    // reveal re-fetch (serverTags now includes it, like production).
    api.updatePost.mockResolvedValue({
      data: savedPost({ ...DRAFT_POST, tagIds: ["tag-9"] }),
      error: null, status: 200, cacheStatus: "failed",
    });
    await click(findButton(container, "保存草稿"));
    expect(hasText(container, "文章已保存，但公开内容刷新失败")).toBe(true);

    await settleRefresh(oldRefresh, "reject");
    expect(hasText(container, "文章已保存，但公开内容刷新失败")).toBe(true);
    expect(hasText(container, "回归标签")).toBe(true);
    expect(hasText(container, "公开内容刷新仍未成功")).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);
  });

  for (const scenario of [
    {
      label: "DRAFT (save/publish/tag)",
      post: DRAFT_POST,
      entries: ["保存草稿", "发布", "确定"],
      openTagPanel: true,
      saveLabel: "保存草稿",
    },
    {
      label: "PUBLISHED (save/archive)",
      post: PUBLISHED_POST,
      entries: ["保存更新", "归档"],
      openTagPanel: false,
      saveLabel: "保存更新",
    },
    {
      label: "ARCHIVED (save/restore/delete)",
      post: ARCHIVED_POST,
      entries: ["保存更新", "恢复为草稿", "删除文章"],
      openTagPanel: false,
      saveLabel: "保存更新",
    },
  ] as const) {
    it(`every write entry is disabled during an in-flight refresh and issues no business request — ${scenario.label}`, async () => {
      api.getAdminPost.mockResolvedValue({ data: scenario.post, error: null, status: 200 });
      await mountEditor();
      if (scenario.openTagPanel) {
        await click(findButton(container, "+ 添加标签"));
        const input = container.querySelector('input[aria-label="新标签名"]');
        const inputElement = input as HTMLInputElement;
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        await act(async () => {
          setValue.call(inputElement, "门禁标签");
          inputElement.dispatchEvent(new Event("input", { bubbles: true }));
          await flush();
        });
      }

      // Produce the warning via one confirmed save, then start a refresh.
      api.updatePost.mockResolvedValue({ data: savedPost(scenario.post), error: null, status: 200, cacheStatus: "failed" });
      await click(findButton(container, scenario.saveLabel));
      expect(hasText(container, "公开内容刷新失败")).toBe(true);
      const writesAfterSave = { update: 1, tag: 0, del: 0 };

      const refresh = deferred<unknown>();
      api.revalidatePublicCache.mockImplementation(() => refresh.promise);
      await click(findButton(container, "重试公开内容刷新"));

      // Every write affordance for this status is disabled while the refresh
      // holds the shared busy gate (React suppresses clicks on disabled
      // buttons — the disabled state IS the UI gate).
      for (const label of scenario.entries) {
        expect(findButton(container, label).disabled).toBe(true);
      }

      // Clicking them anyway (defensive) issues no business request.
      for (const label of scenario.entries) {
        findButton(container, label).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      await act(async () => { await flush(); });
      expect(api.updatePost).toHaveBeenCalledTimes(writesAfterSave.update);
      expect(api.createTag).toHaveBeenCalledTimes(writesAfterSave.tag);
      expect(api.deletePost).toHaveBeenCalledTimes(writesAfterSave.del);
      expect(api.revalidatePublicCache).toHaveBeenCalledTimes(1);

      // After the refresh settles the entries come back.
      await act(async () => {
        refresh.resolve({ data: { cacheStatus: "failed" }, error: null, status: 200 });
        await flush();
      });
      for (const label of scenario.entries) {
        expect(findButton(container, label).disabled).toBe(false);
      }
    });
  }

  it("true UNMOUNT while a refresh is in flight: the stale response neither navigates nor throws", async () => {
    await arriveAtWarning(DRAFT_POST);
    const refresh = deferred<unknown>();
    api.revalidatePublicCache.mockImplementation(() => refresh.promise);
    await click(findButton(container, "重试公开内容刷新"));

    act(() => { root!.unmount(); });
    root = null;
    await act(async () => {
      refresh.resolve({ data: { cacheStatus: "invalidated" }, error: null, status: 200 });
      await flush();
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(container.textContent ?? "").not.toContain("公开内容刷新成功");
  });

  it("true UNMOUNT while a DELETE is in flight: the stale 204+invalidated response never navigates", async () => {
    await arriveAtWarning(ARCHIVED_POST);
    const del = deferred<unknown>();
    api.deletePost.mockImplementation(() => del.promise);
    await click(findButton(container, "删除文章"));
    await click(findButton(container, "确认删除"));

    act(() => { root!.unmount(); });
    root = null;
    await act(async () => {
      del.resolve({ error: null, cacheStatus: "invalidated" });
      await flush();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
