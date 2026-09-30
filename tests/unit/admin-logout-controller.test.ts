import { describe, expect, it, vi } from "vitest";
import {
  createLogoutController,
  LOGOUT_RESULT_MESSAGES,
} from "@/components/views/admin/logout-controller";

/**
 * FR-20 request discipline (Codex review round 1): rapid re-triggers must
 * issue exactly ONE logout request; failed/unknown outcomes must never
 * navigate and must re-arm the draft protection. These are executable
 * call-count and ordering assertions, not source-string checks.
 */

function setup(overrides: Partial<Parameters<typeof createLogoutController>[0]> = {}) {
  const requestSignOut = vi.fn(async () => ({}));
  const verifyLoggedOut = vi.fn(async () => ({ loggedOut: true }));
  const onSuccess = vi.fn();
  const onResult = vi.fn();
  const armLeave = vi.fn();
  const disarmLeave = vi.fn();
  const controller = createLogoutController({
    requestSignOut,
    verifyLoggedOut,
    onSuccess,
    onResult,
    armLeave,
    disarmLeave,
    ...overrides,
  });
  return { controller, requestSignOut, verifyLoggedOut, onSuccess, onResult, armLeave, disarmLeave };
}

describe("logout controller (FR-20.3/5)", () => {
  it("rapid double trigger issues exactly one signOut request and one navigation", async () => {
    const s = setup();
    // Both invocations start before the first request resolves.
    const first = s.controller.perform();
    const second = s.controller.perform();
    expect(s.requestSignOut).toHaveBeenCalledTimes(1);
    await Promise.all([first, second]);
    expect(s.requestSignOut).toHaveBeenCalledTimes(1);
    expect(s.verifyLoggedOut).toHaveBeenCalledTimes(1);
    expect(s.onSuccess).toHaveBeenCalledTimes(1);
    expect(s.onResult).toHaveBeenCalledWith("confirmed", LOGOUT_RESULT_MESSAGES.confirmed);
    // Confirmed logout stays armed for the navigation (no re-ask of the
    // already-confirmed unsaved decision).
    expect(s.disarmLeave).not.toHaveBeenCalled();
    expect(s.armLeave).toHaveBeenCalledTimes(1);
  });

  it("verified logged-out false ⇒ failed: no navigation, guards re-armed, explicit non-success message", async () => {
    const s = setup({ verifyLoggedOut: vi.fn(async () => ({ loggedOut: false })) });
    const outcome = await s.controller.perform();
    expect(outcome).toBe("failed");
    expect(s.onSuccess).not.toHaveBeenCalled();
    expect(s.disarmLeave).toHaveBeenCalledTimes(1);
    expect(s.onResult).toHaveBeenCalledWith("failed", expect.stringContaining("退出未生效"));
  });

  it("signOut rejection ⇒ unknown: no navigation, guards re-armed, message keeps the draft guidance", async () => {
    const s = setup({ requestSignOut: vi.fn(async () => { throw new Error("network down"); }) });
    const outcome = await s.controller.perform();
    expect(outcome).toBe("unknown");
    expect(s.verifyLoggedOut).not.toHaveBeenCalled();
    expect(s.onSuccess).not.toHaveBeenCalled();
    expect(s.disarmLeave).toHaveBeenCalledTimes(1);
    expect(s.onResult).toHaveBeenCalledWith("unknown", expect.stringContaining("无法确认退出结果"));
    expect(s.onResult.mock.calls[0]![1]).toContain("未保存内容已保留");
  });

  it("verification rejection ⇒ unknown even though the request resolved (non-2xx bodies resolve too)", async () => {
    const s = setup({ verifyLoggedOut: vi.fn(async () => { throw new Error("session check failed"); }) });
    const outcome = await s.controller.perform();
    expect(outcome).toBe("unknown");
    expect(s.onSuccess).not.toHaveBeenCalled();
    expect(s.disarmLeave).toHaveBeenCalledTimes(1);
  });

  it("without a verifier, a resolved request counts as confirmed", async () => {
    const s = setup({ verifyLoggedOut: undefined });
    expect(await s.controller.perform()).toBe("confirmed");
    expect(s.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("the mutex resets after completion so a later retry can run again", async () => {
    const s = setup();
    await s.controller.perform();
    await s.controller.perform();
    expect(s.requestSignOut).toHaveBeenCalledTimes(2);
    expect(s.onSuccess).toHaveBeenCalledTimes(2);
  });

  it("isBusy() flips synchronously — before any await", async () => {
    const s = setup();
    const inFlight = s.controller.perform();
    expect(s.controller.isBusy()).toBe(true);
    await inFlight;
    expect(s.controller.isBusy()).toBe(false);
  });
});
