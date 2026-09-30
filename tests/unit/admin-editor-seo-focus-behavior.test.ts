import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * FR-07 focus-timing behavioral test (Codex review round 1): from a COLLAPSED
 * SEO section, submitting a draft whose only error is an over-long SEO title
 * must (a) render the SEO inputs in the same commit as the error — `seoOpen`
 * is derived, no state write — and (b) then move focus to that input. Focus
 * is asserted through a document stub that only returns elements present in
 * the LAST rendered markup, so a focus attempt running before the mounting
 * re-render would record nothing.
 */

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  buttonHandlers: {} as Record<string, () => void | Promise<void>>,
  focusLog: [] as string[],
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
vi.mock("@/components/ui/button", () => ({
  Button: (props: { children?: React.ReactNode; onClick?: () => void | Promise<void>; type?: string }) => {
    const label = Array.isArray(props.children)
      ? props.children.filter((child) => typeof child === "string").join("")
      : String(props.children ?? "");
    if (props.onClick) harness.buttonHandlers[label] = props.onClick;
    return createElement("button", { type: props.type ?? "button" }, props.children);
  },
}));
vi.mock("@/lib/client-api", () => ({
  isAuthFailure: () => false,
  clientApi: {
    getAdminCategories: vi.fn(async () => ({ data: [], error: null, status: 200 })),
    getAdminTags: vi.fn(async () => ({ data: [], error: null, status: 200 })),
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/admin/posts/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminEditorView } from "@/components/views/admin/admin-editor-view";
import { emptyEditorDraft } from "@/components/views/admin/editor-state";

class FakeHTMLElement {
  constructor(public id: string) {}
  focus() { harness.focusLog.push(this.id); }
}

let lastHtml = "";

beforeEach(() => {
  vi.clearAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  harness.buttonHandlers = {};
  harness.focusLog = [];
  lastHtml = "";
  vi.stubGlobal("document", {
    getElementById: (id: string) => (lastHtml.includes(`id="${id}"`) ? new FakeHTMLElement(id) : null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: vi.fn(),
    location: { href: "http://localhost/admin/posts/new", pathname: "/admin/posts/new" },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function render() {
  harness.cursor = 0;
  lastHtml = renderToStaticMarkup(createElement(AdminEditorView, {}));
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

describe("AdminEditorView SEO error focus (FR-07.3, Codex round 1)", () => {
  it("collapsed SEO + seoTitle error ⇒ the input mounts in the same commit as the error, then receives focus", async () => {
    // EditorForm useState order: postId(0), draft(1), savedSnapshot(2), …
    // Seed the ONLY invalid field: an over-long SEO title (61 > 60).
    harness.values[1] = {
      ...emptyEditorDraft(),
      title: "合法标题",
      excerpt: "合法摘要",
      contentMd: "合法正文",
      seoTitle: "超".repeat(61),
    };

    const before = render();
    // Collapsed start: the SEO input is NOT mounted and nothing is focused.
    expect(before).not.toContain('id="editor-seo-title"');
    expect(before).toMatch(/aria-expanded="false"/);
    await flushEffects(); // mount effects (options fetch, guards)

    // Submit: client-side validation fails fast on the SEO field only.
    await harness.buttonHandlers["保存草稿"]!();
    // Locate the field-error state by CONTENT (hook cursor indexes are
    // brittle across refactors of the component's hook order). The draft
    // object also carries a seoTitle key — excluded via its tagIds array.
    const errors = harness.values.find(
      (value) => !!value && typeof value === "object" && !Array.isArray(value)
        && "seoTitle" in (value as Record<string, unknown>)
        && !Array.isArray((value as Record<string, unknown>).tagIds),
    ) as Record<string, string> | undefined;
    expect(errors?.seoTitle).toContain("SEO 标题");

    // The re-render mounts the SEO input in the SAME commit that shows the
    // error (derived `seoOpen` — no intermediate state write)…
    const after = render();
    expect(after).toContain('id="editor-seo-title"');
    expect(after).toMatch(/aria-expanded="true"/);
    expect(after).toContain("SEO 标题不能超过 60");
    expect(after).toContain('aria-invalid="true"');

    // …and the focus effect, running after that commit, reaches the input
    // (the document stub only resolves ids present in the rendered markup).
    await flushEffects();
    expect(harness.focusLog).toContain("editor-seo-title");
  });

  it("focus prefers the first correctable field in UI order when several fields error", async () => {
    harness.values[1] = {
      ...emptyEditorDraft(),
      title: "",
      excerpt: "摘要",
      contentMd: "正文",
      seoTitle: "超".repeat(61),
    };
    render();
    await flushEffects();
    await harness.buttonHandlers["保存草稿"]!();
    render();
    await flushEffects();
    expect(harness.focusLog).toContain("editor-title");
    expect(harness.focusLog).not.toContain("editor-seo-title");
    // The SEO section still auto-expanded for its own error.
    expect(lastHtml).toContain('id="editor-seo-title"');
  });
});
