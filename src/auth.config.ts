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
  // trustHost: true — required for ANY self-hosted production build (README
  // `pnpm start`, docker-compose) on non-Vercel/CF platforms. Without it Auth.js
  // throws `UntrustedHost` on every /api/auth/* request in NODE_ENV=production,
  // making admin login impossible (FIND-RB-001 fix). Safe here because the CSRF
  // surface is already contained by same-origin Origin checks on write endpoints
  // and Auth.js's SameSite=Lax session cookie; we do not rely on the Host header
  // for any authorization decision (requireAdmin() is the authoritative check).
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

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/admin", nextUrl));
        return true;
      }
      if (nextUrl.pathname.startsWith("/admin")) {
        return isLoggedIn; // false → Auth.js redirects to the signIn page
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
