"use client";

import React, { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { CatAvatar, CatLogo, PawIcon, NavUnderline, PottedPlant } from "./cat-doodles";
import { Modal } from "./modal";
import { clientApi } from "@/lib/client-api";
import {
  adminLeaveBlockedSubject,
  adminLeaveBusy,
  armLogoutLeave,
  disarmLogoutLeave,
  getAdminLeaveVersion,
  subscribeAdminLeave,
} from "../views/admin/logout-guard";
import { createLogoutController } from "../views/admin/logout-controller";

export interface HeaderProps {
  admin?: boolean;
  activePath?: string;
  userName?: string;
  onLogout?: () => void;
}

/**
 * Read-only post-logout verification (FR-20.5 / Codex reviews rounds 2+3): a
 * resolved signOut call is not proof — the underlying client does not check
 * res.ok. Confirmation requires the endpoint to answer with a response that
 * PROVES the caller is unauthenticated: HTTP 401 carrying this endpoint's
 * unauthenticated codes (AUTH_REQUIRED / AUTH_INVALID).
 *
 * The HTTP status gates FIRST; error codes only refine within a status:
 *   - any 403 — including 403 ADMIN_DISABLED (the session cookie still
 *     authenticates a disabled account, so the signOut did not take effect)
 *     and 403 combined with AUTH_* codes — never confirms;
 *   - any 200 — including 200 combined with AUTH_* codes — never confirms;
 *   - contradictory or unrecognized combinations (AUTH_* on a non-401
 *     status, 401 with an unexpected code) are UNKNOWN, never success.
 * "Cannot enter the admin area" must never be conflated with "logout done".
 */
async function verifyLoggedOut(): Promise<{ loggedOut: boolean }> {
  const res = await clientApi.getMe();
  if (res.status === 0 || res.status >= 500 || res.errorCode === "INVALID_RESPONSE") {
    throw new Error("logout outcome unverifiable");
  }
  const carriesUnauthenticatedCode =
    res.errorCode === "AUTH_REQUIRED" || res.errorCode === "AUTH_INVALID";
  if (res.status === 401) {
    if (carriesUnauthenticatedCode) return { loggedOut: true };
    // 401 with an unrecognized code: abnormal — fail closed.
    throw new Error("logout outcome unverifiable");
  }
  if (carriesUnauthenticatedCode) {
    // AUTH_* on a NON-401 status (proxy rewrite, future behavior): the
    // combination is contradictory and proves nothing.
    throw new Error("logout outcome unverifiable");
  }
  if (res.status === 403 && res.errorCode === "ADMIN_DISABLED") {
    // Session cookie still valid (account disabled): the logout did not happen.
    return { loggedOut: false };
  }
  if (res.status === 200) {
    return { loggedOut: false };
  }
  throw new Error("logout outcome unverifiable");
}

export function Header({
  admin = false,
  activePath = "",
  userName = "Leon",
  onLogout,
}: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  // FR-20: the unsaved decision happens BEFORE any signOut call.
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  useSyncExternalStore(subscribeAdminLeave, getAdminLeaveVersion, getAdminLeaveVersion);
  const blockedSubject = adminLeaveBlockedSubject();
  const leaveBusy = adminLeaveBusy();

  // The controller lives in a lazy useState initializer: created exactly
  // once, with NO ref reads/writes during render (react-hooks/refs). It owns
  // the synchronous logout mutex across the component's lifetime.
  // `onLogout` (legacy compatibility prop, no current caller) is bound at
  // creation; `router` is stable for the app's lifetime.
  const [logoutController] = useState(() => createLogoutController({
    requestSignOut: async () => {
      if (onLogout) return onLogout();
      return signOut({ redirectTo: "/admin/login", redirect: false });
    },
    // Verification is UNCONDITIONAL (work/74): even an injected onLogout
    // must not be able to claim success without the read-only session
    // check confirming it — a resolved promise alone proves nothing.
    verifyLoggedOut,
    onSuccess: () => {
      // Exactly one navigation, only on a CONFIRMED logout; programmatic
      // replace is not intercepted by the per-view leave guards.
      router.replace("/admin/login");
    },
    onResult: (outcome, message) => {
      setLoggingOut(false);
      setConfirmLogout(false);
      setLogoutError(outcome === "confirmed" ? null : message);
    },
    armLeave: armLogoutLeave,
    disarmLeave: disarmLogoutLeave,
  }));

  /**
   * Runs only after the unsaved decision (if any) has been confirmed. The
   * controller owns the synchronous mutex (rapid re-triggers issue ONE
   * request) and refuses to navigate/re-arm on failed/unknown outcomes.
   */
  const performLogout = useCallback(async () => {
    if (logoutController.isBusy()) return;
    setLoggingOut(true);
    setLogoutError(null);
    await logoutController.perform();
  }, [logoutController]);

  const requestLogout = () => {
    if (leaveBusy || loggingOut || logoutController.isBusy()) return;
    setLogoutError(null);
    // Clean state keeps the simple one-step logout (FR-20.6).
    if (!blockedSubject) {
      void performLogout();
      return;
    }
    setConfirmLogout(true);
  };

  const logoutButton = (className: string) => (
    <button
      type="button"
      onClick={requestLogout}
      disabled={leaveBusy || loggingOut}
      title={leaveBusy ? "正在保存或提交，请等待结果后再退出" : undefined}
      aria-disabled={leaveBusy || loggingOut || undefined}
      className={className}
    >
      {loggingOut ? "退出中…" : "退出"}
    </button>
  );
  const desktopLogoutClass =
    "px-4 py-1.5 text-xs font-bold rounded-full border border-[#D5C7B2] bg-white text-[#554E45] hover:border-[#E65A00] hover:text-[#E65A00] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";
  const mobileLogoutClass =
    "px-3 py-1.5 text-xs font-bold rounded-full border border-[#D5C7B2] bg-white text-[#554E45] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

  interface NavLink {
    label: string;
    href: string;
    id: string;
  }

  const visitorLinks: NavLink[] = [
    { label: "文章", href: "/posts", id: "posts" },
    { label: "分类", href: "/categories", id: "categories" },
    { label: "标签", href: "/tags", id: "tags" },
    { label: "搜索", href: "/search", id: "search" },
  ];

  const adminLinks: NavLink[] = [
    { label: "概览", href: "/admin", id: "admin" },
    { label: "文章", href: "/admin/posts", id: "admin-posts" },
    { label: "分类", href: "/admin/categories", id: "admin-categories" },
    { label: "标签", href: "/admin/tags", id: "admin-tags" },
  ];

  const links: NavLink[] = admin ? adminLinks : visitorLinks;

  const isActive = (href: string, id: string) => {
    if (activePath === href || activePath === id) return true;
    if (href !== "/" && href !== "/admin" && activePath.startsWith(href)) return true;
    return false;
  };

  return (
    <header className="site-header sticky top-0 z-40 w-full">
      <div className="site-header-inner flex items-center justify-between">
        {/* Brand / Logo */}
        <Link
          href={admin ? "/admin" : "/"}
          className="flex items-center gap-2.5 font-extrabold text-xl sm:text-2xl text-[#1A1A1A] hover:opacity-90 transition-opacity"
        >
          {admin ? (
            <>
              <PawIcon className="w-7 h-7 text-[#E65A00]" />
              <span className="font-serif tracking-tight">管理后台</span>
            </>
          ) : (
            <>
              <PawIcon className="w-7 h-7 text-[#E65A00]" />
              <span className="font-serif tracking-tight text-xl">Leon 的博客</span>
            </>
          )}
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 lg:gap-12">
          {links.map((link) => {
            const active = isActive(link.href, link.id);
            return (
              <Link
              key={link.id}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative min-h-11 py-2 text-base font-semibold transition-colors flex items-center gap-1.5 ${
                  active ? "text-[#E65A00]" : "text-[#3D3832] hover:text-[#E65A00]"
                }`}
              >
                {link.id === "search" && (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>
                )}
                <span>{link.label}</span>
                {active && (
                  <span className="absolute -bottom-1 left-0 right-0 w-full h-1.5 flex justify-center animate-fade-in pointer-events-none">
                    <NavUnderline className="w-full h-1.5 text-[#E65A00]" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Header Right Actions (Admin Mode Only) */}
        {admin && (
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1A1A1A]">
              <CatLogo className="w-7 h-7" />
              <span>{userName}</span>
            </div>
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-[#E65A00] hover:underline flex items-center gap-0.5"
            >
              <span>查看站点</span>
              <span>↗</span>
            </Link>
            {logoutButton(desktopLogoutClass)}
          </div>
        )}

        {!admin && isHome && (
          <div className="hidden md:flex items-center gap-4">
            {/* Home mockup: sun + avatar */}
            <svg
              className="h-6 w-6 text-[#3A332C]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
            </svg>
            <CatAvatar className="h-9 w-9" />
          </div>
        )}

        {!admin && !isHome && (
          <PottedPlant className="hidden h-14 w-16 object-contain md:block" />
        )}

        {/* Mobile menu toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-[#1A1A1A] hover:bg-[#F2ECE1]"
            aria-label="菜单"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E2D6C5] bg-[var(--color-bg)] px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2">
            {links.map((link) => {
              const active = isActive(link.href, link.id);
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between ${
                    active ? "bg-[#FFF5EE] text-[#E65A00]" : "text-[#3D3832]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{link.label}</span>
                  </span>
                  {active && <PawIcon className="w-4 h-4 text-[#E65A00]" />}
                </Link>
              );
            })}
          </nav>
          {admin && (
            <div className="pt-3 border-t border-[#E2D6C5] flex items-center justify-between">
              <Link
                href="/"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#E65A00]"
                onClick={() => setMobileOpen(false)}
              >
                查看站点 ↗
              </Link>
              {logoutButton(mobileLogoutClass)}
            </div>
          )}

          {admin && logoutError && (
            <p role="alert" className="md:hidden pt-2 text-[11px] font-semibold text-[#E65A00]">{logoutError}</p>
          )}
        </div>
      )}

      {admin && logoutError && (
        <p role="alert" className="hidden md:block border-t border-[#E2D6C5] bg-[#FFF5EE] px-6 py-2 text-[11px] font-semibold text-[#E65A00]">
          {logoutError}
        </p>
      )}

      {/* FR-20: the unsaved decision comes BEFORE signOut — canceling issues
          zero logout requests and keeps drafts, versions, and pending tags. */}
      <Modal
        isOpen={confirmLogout}
        title="有未保存的内容"
        description={`${blockedSubject ?? "当前页面"}存在未保存的修改或未确认的操作。确认退出将放弃这些内容并注销登录；取消则保留全部输入，不会发出退出请求。`}
        confirmText="放弃修改并退出"
        isDanger
        confirmPending={loggingOut}
        onConfirm={() => { void performLogout(); }}
        onCancel={() => { if (!loggingOut) setConfirmLogout(false); }}
      />
    </header>
  );
}
