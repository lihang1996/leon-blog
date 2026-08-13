import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authenticateCredentials } from "@/modules/auth/auth.service";

/**
 * The single Auth.js configuration (architecture §11). Credentials + encrypted
 * JWT Session Cookie. The cookie only carries { id, displayName,
 * sessionVersion }; `requireAdmin()` re-checks the DB on every protected read.
 * This file imports Prisma/argon2, so it must never be imported by `proxy.ts`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const user = await authenticateCredentials(credentials?.email, credentials?.password);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.displayName = user.displayName;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // JWT is Record<string, unknown> — narrow with explicit casts.
        session.user.id = (token.userId as string | undefined) ?? "";
        session.user.displayName = (token.displayName as string | undefined) ?? "";
        session.user.sessionVersion = (token.sessionVersion as number | undefined) ?? 1;
      }
      return session;
    },
  },
});
