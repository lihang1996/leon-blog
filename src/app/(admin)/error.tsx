"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

/**
 * Admin error boundary (FIND-201 fix). Catches errors thrown by admin pages and
 * the admin layout — most importantly the auth errors raised by requireAdmin()
 * for force-logged-out / disabled accounts. Session-related failures clear the
 * session cookie and send the admin back to /admin/login instead of stranding
 * them on the framework error page until the JWT maxAge elapses. Transient
 * errors get a retry affordance.
 *
 * WHY signOut() FIRST: the proxy's `authorized` callback (auth.config.ts) treats
 * a still-valid JWT as logged-in and bounces /admin/login → /admin. For a
 * sessionVersion-bumped / disabled account the JWT is valid while the DB
 * rejects it, so navigating straight to /admin/login would loop
 * /admin → error → /admin/login → /admin forever. Clearing the cookie first
 * lets the login page render normally (FIND-201 round-2 fix).
 *
 * requireAdmin() runs before any data access, so the security boundary holds
 * regardless; this boundary only makes the forced-exit path user-visible.
 */
const AUTH_ERROR_PATTERN = /请先登录|会话无效|会话已失效|账号已停用|not authenticated|unauthorized/i;

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (AUTH_ERROR_PATTERN.test(error.message)) {
      signOut({ redirect: false }).finally(() => router.replace("/admin/login"));
    } else {
      console.error("admin boundary error", error);
    }
  }, [error, router]);

  return (
    <div className="py-24 text-center">
      <h1 className="font-serif-cn text-2xl font-bold text-text">管理端加载失败</h1>
      <p className="mt-2 text-text-muted">请稍后重试；若会话已失效，将自动跳转到登录页。</p>
      <p className="mt-8">
        <button
          type="button"
          onClick={() => reset()}
          className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-text"
        >
          重试
        </button>
      </p>
    </div>
  );
}
