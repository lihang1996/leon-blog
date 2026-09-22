import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (architecture §11.2). No database, no providers —
 * this is only imported by `proxy.ts`, so the middleware never loads the Prisma
 * client or native argon2. The full config in `auth.ts` spreads this and adds
 * the Credentials provider + DB-backed callbacks for the Node runtime.
 */
export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12 hours (architecture §11.1)
  },
  // Retain self-hosted Auth.js compatibility. Production ingress must validate
  // Host and replace forwarded host/protocol headers used by Auth.js itself.
  // This is NOT approval to trust forwarded client IPs for authentication limits.
  // Admin authorization and write-origin checks do not trust these headers.
  trustHost: true,
  pages: {
    signIn: "/admin/login",
  },
  providers: [],
  callbacks: {
    /** Optimistic layer only — real authorization happens in requireAdmin(). */
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/admin/login";

      // Always let the server login helper check the actual account/session.
      // A JWT (or an attacker-supplied reason) cannot decide redirect or cleanup.
      if (isOnLogin) return true;
      if (nextUrl.pathname === "/admin" || nextUrl.pathname.startsWith("/admin/")) {
        return isLoggedIn; // false → Auth.js redirects to the signIn page
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
