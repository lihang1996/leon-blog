import { describe, expect, it, vi } from "vitest";
import {
  adminLeaveBlockedSubject,
  adminLeaveBusy,
  armLogoutLeave,
  disarmLogoutLeave,
  ensureAdminLeaveGuard,
  getAdminLeaveVersion,
  isLogoutLeaveArmed,
  registerAdminLeaveGuard,
  subscribeAdminLeave,
  unregisterAdminLeaveGuard,
} from "@/components/views/admin/logout-guard";

/**
 * FR-20 shared registry: the header's logout decision consumes exactly these
 * states. The interactive confirm-modal flow (zero logout requests on cancel,
 * exactly one on confirm) needs a browser and is separately marked 未验.
 */

describe("admin leave guard registry", () => {
  it("reports the first blocked subject across all registered views", () => {
    const unregisterEditor = registerAdminLeaveGuard("editor", { blocked: true, busy: false, subject: "文章编辑器" });
    expect(adminLeaveBlockedSubject()).toBe("文章编辑器");
    const unregisterTags = registerAdminLeaveGuard("tags", { blocked: true, busy: false, subject: "标签管理表单" });
    expect(adminLeaveBlockedSubject()).toBe("文章编辑器");
    unregisterEditor();
    expect(adminLeaveBlockedSubject()).toBe("标签管理表单");
    unregisterTags();
    expect(adminLeaveBlockedSubject()).toBeNull();
  });

  it("busy wins nothing by itself but blocks logout availability from any view", () => {
    const unregister = registerAdminLeaveGuard("categories", { blocked: false, busy: true, subject: "分类管理表单" });
    expect(adminLeaveBusy()).toBe(true);
    expect(adminLeaveBlockedSubject()).toBeNull();
    unregister();
    expect(adminLeaveBusy()).toBe(false);
  });

  it("ensure upserts without notifying when nothing changed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAdminLeave(listener);
    const before = getAdminLeaveVersion();
    ensureAdminLeaveGuard("editor", { blocked: false, busy: false, subject: "文章编辑器" });
    expect(getAdminLeaveVersion()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    ensureAdminLeaveGuard("editor", { blocked: false, busy: false, subject: "文章编辑器" });
    expect(getAdminLeaveVersion()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    ensureAdminLeaveGuard("editor", { blocked: true, busy: false, subject: "文章编辑器" });
    expect(getAdminLeaveVersion()).toBe(before + 2);
    expect(adminLeaveBlockedSubject()).toBe("文章编辑器");
    unregisterAdminLeaveGuard("editor");
    expect(adminLeaveBlockedSubject()).toBeNull();
    unsubscribe();
  });

  it("re-ensuring under the same id keeps the latest state; cleanup removes it once", () => {
    ensureAdminLeaveGuard("editor", { blocked: true, busy: false, subject: "文章编辑器" });
    ensureAdminLeaveGuard("editor", { blocked: false, busy: false, subject: "文章编辑器" });
    expect(adminLeaveBlockedSubject()).toBeNull(); // latest state wins
    unregisterAdminLeaveGuard("editor");
    // A second unregister of the same id is a no-op.
    expect(() => unregisterAdminLeaveGuard("editor")).not.toThrow();
  });
});

describe("logout leave suppression (FR-20.3/5)", () => {
  it("arms for the confirmed logout navigation and re-arms on failure", () => {
    expect(isLogoutLeaveArmed()).toBe(false);
    armLogoutLeave();
    expect(isLogoutLeaveArmed()).toBe(true);
    disarmLogoutLeave();
    expect(isLogoutLeaveArmed()).toBe(false);
  });
});
