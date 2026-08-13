import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Optimistic redirect layer (architecture §11.2). Uses the edge-safe config so
 * the middleware only decrypts the session cookie — it never touches the
 * database. `requireAdmin()` inside pages/route handlers is the authoritative
 * check (isActive + sessionVersion).
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*"],
};
