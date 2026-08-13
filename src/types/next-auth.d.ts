import type { DefaultSession } from "next-auth";

/**
 * Auth.js type augmentation (architecture §11.3).
 *
 * The JWT Session Cookie only ever carries the minimal admin fields below —
 * never the password hash, email-revealing fields, or anything sensitive.
 * `requireAdmin()` re-reads the DB (isActive + sessionVersion) on every
 * protected access; these types are just the cookie shape.
 */

declare module "next-auth" {
  interface User {
    displayName?: string;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      displayName: string;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    displayName?: string;
    sessionVersion?: number;
  }
}
