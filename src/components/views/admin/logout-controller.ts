/**
 * FR-20 logout controller: the unsaved decision has ALREADY been confirmed by
 * the caller when `perform()` runs. This module owns the request discipline:
 *
 *   - a SYNCHRONOUS mutex so rapid re-triggers (double click, desktop +
 *     mobile handlers racing) can never issue a second logout request;
 *   - outcome verification — `requestSignOut` resolving is NOT proof of a
 *     logout (the underlying client parses the JSON without checking
 *   `res.ok`), so an optional read-only `verifyLoggedOut` decides between
 *     confirmed / failed / unknown;
 *   - on anything but "confirmed" the page stays put, the per-view leave
 *     guards are re-armed (the draft protection is NOT released), and the UI
 *     gets an explicit non-success message — never an unconditional success.
 */

export type LogoutOutcome = "confirmed" | "failed" | "unknown";

export const LOGOUT_RESULT_MESSAGES: Record<LogoutOutcome, string> = {
  confirmed: "",
  failed: "退出未生效：会话仍然有效，当前页面与未保存内容已保留，请稍后重试。",
  unknown: "无法确认退出结果：会话状态未知，当前页面与未保存内容已保留；请核对登录状态后再决定是否重试。",
};

export interface LogoutControllerDeps {
  /** Performs the single sign-out request; rejection ⇒ outcome unknown. */
  requestSignOut: () => Promise<unknown>;
  /**
   * Read-only post-check (e.g. GET the session endpoint): resolves
   * `{ loggedOut }`; rejection ⇒ outcome unknown. Optional — without it a
   * resolved requestSignOut is treated as confirmed.
   */
  verifyLoggedOut?: () => Promise<{ loggedOut: boolean }>;
  /** Runs exactly once, only on a confirmed logout (navigate). */
  onSuccess: () => void;
  /** UI feedback for every settled outcome. */
  onResult: (outcome: LogoutOutcome, message: string) => void;
  /** Suppress the per-view leave guards for the logout navigation. */
  armLeave: () => void;
  /** Re-arm them when the logout could not be confirmed. */
  disarmLeave: () => void;
}

export function createLogoutController(deps: LogoutControllerDeps) {
  let inFlight = false;
  const perform = async (): Promise<LogoutOutcome> => {
    if (inFlight) return "unknown"; // synchronous guard: no second request
    inFlight = true;
    deps.armLeave();
    let outcome: LogoutOutcome = "unknown";
    let requestFailed = false;
    try {
      try {
        await deps.requestSignOut();
      } catch {
        requestFailed = true;
      }
      if (!requestFailed) {
        if (deps.verifyLoggedOut) {
          try {
            const verification = await deps.verifyLoggedOut();
            outcome = verification.loggedOut ? "confirmed" : "failed";
          } catch {
            outcome = "unknown";
          }
        } else {
          outcome = "confirmed";
        }
      }
    } finally {
      if (outcome === "confirmed") {
        // Stay armed for the navigation itself; the leave guards must not
        // re-ask the already-answered unsaved question (FR-20.3).
        deps.onSuccess();
      } else {
        // Failed/unknown: the page must survive with its draft protection.
        deps.disarmLeave();
      }
      deps.onResult(outcome, LOGOUT_RESULT_MESSAGES[outcome]);
      inFlight = false;
    }
    return outcome;
  };
  return {
    perform,
    /** Synchronous read for disabling controls without waiting a tick. */
    isBusy: () => inFlight,
  };
}
