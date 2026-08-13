import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminHeader } from "@/components/admin/admin-header";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth-gating in a layout leaves no meaningful static shell, so admin routes
 * opt out of instant-navigation validation and render per-request (Next 16.3
 * Cache Components model — the old `export const dynamic` is not allowed here).
 */
export const instant = false;

/**
 * Admin shell (architecture §6.2). Every admin page data read runs through
 * requireAdmin() first (authoritative: isActive + sessionVersion). The proxy
 * already redirects unauthenticated users to /admin/login for the happy path.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen">
      <AdminHeader displayName={admin.displayName} />
      <main className="mx-auto w-full max-w-blog px-page py-8">{children}</main>
    </div>
  );
}
