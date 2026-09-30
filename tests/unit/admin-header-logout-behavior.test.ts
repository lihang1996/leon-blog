import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * FR-20 header wiring (Codex review round 1): drives the REAL header through
 * its captured Modal handlers — cancel issues zero logout requests; a rapid
 * double confirm issues exactly one; failed/unknown outcomes never navigate
 * and re-arm the leave guards (asserted on the shared logout-guard module).
 */

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  signOut: vi.fn(),
  getMe: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() },
  modal: null as null | { isOpen: boolean; onConfirm: () => void; onCancel: () => void; confirmPending: boolean },
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
vi.mock("next-auth/react", () => ({ signOut: harness.signOut }));
vi.mock("@/lib/client-api", () => ({
  isAuthFailure: (result: { status?: number; errorCode?: string | null }) =>
    result.status === 401 || result.status === 403
    || ["AUTH_REQUIRED", "AUTH_INVALID", "ADMIN_DISABLED"].includes(result.errorCode ?? ""),
  clientApi: { getMe: harness.getMe },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/ui/modal", () => ({
  Modal: (props: { isOpen: boolean; onConfirm: () => void; onCancel: () => void; confirmPending: boolean }) => {
    harness.modal = props;
    return props.isOpen ? createElement("div", {}, "modal-open") : null;
  },
}));

import { Header } from "@/components/ui/header";
import { disarmLogoutLeave, isLogoutLeaveArmed } from "@/components/views/admin/logout-guard";

/** Header useState order: mobileOpen(0), confirmLogout(1), loggingOut(2), logoutError(3). */
function renderHeader(confirmLogoutOpen: boolean) {
  harness.cursor = 0;
  harness.values[1] = confirmLogoutOpen;
  return renderToStaticMarkup(createElement(Header, { admin: true, activePath: "/admin" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  harness.modal = null;
  disarmLogoutLeave();
  harness.signOut.mockResolvedValue({});
});

describe("Header logout flow (FR-20, Codex round 1)", () => {
  it("canceling the confirmation issues ZERO logout requests and closes the dialog (AC-20-01)", async () => {
    renderHeader(true);
    expect(harness.modal?.isOpen).toBe(true);
    harness.modal!.onCancel();
    expect(harness.signOut).not.toHaveBeenCalled();
    expect(harness.getMe).not.toHaveBeenCalled();
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(harness.values[1]).toBe(false); // confirmLogout cleared
  });

  it("a rapid double confirm issues exactly ONE signOut request; confirmed outcome navigates exactly once", async () => {
    renderHeader(true);
    harness.getMe.mockResolvedValue({ data: null, error: "登录状态已失效", status: 401, errorCode: "AUTH_REQUIRED" });
    // Both confirms fire before the first request settles; onConfirm returns
    // void, so the async chain is drained explicitly before asserting.
    harness.modal!.onConfirm();
    harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.signOut).toHaveBeenCalledTimes(1);
    expect(harness.getMe).toHaveBeenCalledTimes(1);
    expect(harness.router.replace).toHaveBeenCalledTimes(1);
    expect(harness.router.replace).toHaveBeenCalledWith("/admin/login");
    // Confirmed logout stays armed so the navigation cannot re-ask the
    // already-confirmed unsaved decision.
    expect(isLogoutLeaveArmed()).toBe(true);
  });

  it("an unknown signOut result (rejection) never navigates, re-arms the guards, and shows the explicit unknown message", async () => {
    renderHeader(true);
    harness.signOut.mockRejectedValue(new Error("network down"));
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("无法确认退出结果");
    expect(String(harness.values[3])).toContain("未保存内容已保留");
  });

  it("a verified-still-logged-in session is a definite failure: no navigation, guards re-armed", async () => {
    renderHeader(true);
    harness.getMe.mockResolvedValue({ data: { id: "u", email: "a@b.c", displayName: "x" }, error: null, status: 200 });
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("退出未生效");
  });

  it("403 ADMIN_DISABLED is NOT a logout (session cookie still authenticates): zero navigation, guards re-armed, non-success message (Codex round 2 P1)", async () => {
    renderHeader(true);
    // requireAdmin() answers 403 ADMIN_DISABLED while the cookie is still
    // valid (account disabled) — the signOut visibly did not take effect.
    harness.getMe.mockResolvedValue({ data: null, error: "账号已停用", status: 403, errorCode: "ADMIN_DISABLED" });
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.signOut).toHaveBeenCalledTimes(1); // the request did go out…
    expect(harness.router.replace).not.toHaveBeenCalled(); // …but proves nothing
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("退出未生效");
    expect(String(harness.values[3])).not.toContain("无法确认"); // definite failure, not unknown
  });

  it("an unrecognized 403 is uncertain: unknown outcome — zero navigation, guards re-armed, explicit unknown message", async () => {
    renderHeader(true);
    harness.getMe.mockResolvedValue({ data: null, error: "请求失败 (403)", status: 403, errorCode: "HTTP_ERROR" });
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("无法确认退出结果");
    expect(String(harness.values[3])).toContain("未保存内容已保留");
  });

  it("403 carrying AUTH_REQUIRED is contradictory and never confirms: unknown, zero navigation, guards re-armed (Codex round 3 P1)", async () => {
    renderHeader(true);
    harness.getMe.mockResolvedValue({ data: null, error: "请先登录", status: 403, errorCode: "AUTH_REQUIRED" });
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.signOut).toHaveBeenCalledTimes(1);
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("无法确认退出结果");
    expect(String(harness.values[3])).not.toContain("退出未生效"); // unknown, not a definite failure claim
  });

  it("200 carrying AUTH_INVALID is contradictory and never confirms: unknown, zero navigation, guards re-armed (Codex round 3 P1)", async () => {
    renderHeader(true);
    harness.getMe.mockResolvedValue({ data: null, error: "会话无效，请重新登录", status: 200, errorCode: "AUTH_INVALID" });
    await harness.modal!.onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.router.replace).not.toHaveBeenCalled();
    expect(isLogoutLeaveArmed()).toBe(false);
    expect(String(harness.values[3])).toContain("无法确认退出结果");
    expect(String(harness.values[3])).toContain("未保存内容已保留");
  });
});
