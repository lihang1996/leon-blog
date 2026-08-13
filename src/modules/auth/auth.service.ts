import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeEmail } from "@/lib/slug";

/**
 * Credentials authentication (architecture §11).
 *
 * - Password hashes use Argon2id.
 * - A missing email still runs one fixed Argon2id verify so the response time
 *   does not reveal whether the account exists (§11.5).
 * - Failed logins atomically increment the account counter and lock the account
 *   for 15 minutes at the 5th consecutive failure.
 * - Success resets the counter/lock and stamps last_login_at.
 * - Locked, disabled, wrong-password and missing-account all return the same
 *   generic `null` so callers cannot distinguish them.
 */

export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_SECONDS = 15 * 60;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  sessionVersion: number;
};

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash("leon-blog-fixed-dummy-password");
  return dummyHashPromise;
}

async function failWithDummyVerify(): Promise<null> {
  await verify(await getDummyHash(), "leon-blog-fixed-dummy-password");
  return null;
}

export async function authenticateCredentials(
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<AuthUser | null> {
  const email = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!email || !password) return failWithDummyVerify();

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      isActive: true,
      lockedUntil: true,
      sessionVersion: true,
    },
  });

  if (!user) {
    await failWithDummyVerify();
    // Equalize the DB round-trip the wrong-password path performs
    // (registerFailedLogin) so response timing does not reveal account
    // existence. 0 rows are affected for a missing email (FIND-209 fix).
    await prisma.$executeRaw(Prisma.sql`UPDATE users SET failed_login_count = failed_login_count WHERE email = ${email}`);
    return null;
  }

  // Locked out: keep timing uniform with a real verify before rejecting.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verify(user.passwordHash, password);
    return null;
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    await registerFailedLogin(user.id);
    return null;
  }

  // Success: reset counters and stamp the login time.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  if (!user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    sessionVersion: user.sessionVersion,
  };
}

/**
 * Atomic counter+lock update — the lock decision is in the same statement.
 *
 * Lock-DoS guard (FIND-210 fix): when the previous lock has already EXPIRED,
 * reset the counter to 1 and clear the lock instead of incrementing from the
 * stale value — otherwise `locked_until` expiring with `failed_login_count`
 * still ≥ MAX means a single further failure instantly re-locks, letting anyone
 * who knows the admin email lock the account repeatedly.
 */
async function registerFailedLogin(userId: string): Promise<void> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION_SECONDS * 1000);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE users
    SET
      failed_login_count = CASE
        WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN 1
        ELSE failed_login_count + 1
      END,
      locked_until = CASE
        WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN NULL
        WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS} THEN ${lockUntil}
        ELSE locked_until
      END
    WHERE id = ${userId}
  `);
}
