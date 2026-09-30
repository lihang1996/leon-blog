/**
 * Shared unsaved-state registry for the admin logout decision (FR-20).
 *
 * The Header owns the 退出 button but cannot see any view's editor state, so
 * every admin view that can hold unsaved input registers its leave-guard
 * state here (the SAME conditions its in-page leave guard blocks on). The
 * Header then decides, BEFORE calling signOut:
 *
 *   - any guard busy     → the logout control is unavailable until the write
 *                          settles (FR-20.4);
 *   - any guard blocked  → a confirmation first; canceling must issue zero
 *                          logout requests (FR-20.1/2);
 *   - nothing blocked    → the simple one-step logout is kept (FR-20.6).
 *
 * After the user confirms, `armLogoutLeave()` suppresses the per-view leave
 * guards for the logout navigation itself so the same unsaved decision is
 * never asked twice (FR-20.3). A failed logout re-arms them (FR-20.5).
 */

export interface AdminLeaveGuardState {
  /** True when leaving would silently lose input / an unconfirmed result. */
  blocked: boolean;
  /** True while a write is in flight — logout must wait (FR-20.4). */
  busy: boolean;
  /** Human-readable subject shown in the confirmation, e.g. 文章编辑器. */
  subject: string;
}

type Listener = () => void;

const guards = new Map<string, AdminLeaveGuardState>();
const listeners = new Set<Listener>();
let version = 0;
let logoutArmed = false;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export function ensureAdminLeaveGuard(id: string, state: AdminLeaveGuardState): void {
  const current = guards.get(id);
  if (
    current
    && current.blocked === state.blocked
    && current.busy === state.busy
    && current.subject === state.subject
  ) {
    return;
  }
  guards.set(id, state);
  notify();
}

/** Upserts a view's guard and returns its unmount cleanup. */
export function registerAdminLeaveGuard(id: string, initial: AdminLeaveGuardState): () => void {
  ensureAdminLeaveGuard(id, initial);
  return () => { unregisterAdminLeaveGuard(id); };
}

export function unregisterAdminLeaveGuard(id: string): void {
  if (guards.delete(id)) notify();
}

/** useSyncExternalStore plumbing: the snapshot is the change counter. */
export function subscribeAdminLeave(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAdminLeaveVersion(): number {
  return version;
}

/** First blocked subject, or null when every registered view is clean. */
export function adminLeaveBlockedSubject(): string | null {
  for (const state of guards.values()) {
    if (state.blocked) return state.subject;
  }
  return null;
}

export function adminLeaveBusy(): boolean {
  for (const state of guards.values()) {
    if (state.busy) return true;
  }
  return false;
}

/**
 * Suppresses the per-view leave guards for the logout navigation after the
 * user has ALREADY confirmed abandoning unsaved input (FR-20.3). Re-armed on
 * logout failure so accidental leaves stay protected (FR-20.5).
 */
export function armLogoutLeave(): void {
  logoutArmed = true;
}

export function disarmLogoutLeave(): void {
  logoutArmed = false;
}

export function isLogoutLeaveArmed(): boolean {
  return logoutArmed;
}
