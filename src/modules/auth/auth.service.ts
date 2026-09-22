import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeEmail } from "@/lib/slug";
import { createHmac } from "node:crypto";
import { runtimeEnv } from "@/lib/env";
import { logger } from "@/lib/logger/logger";

/**
 * Credentials authentication (architecture §11).
 *
 * - Password hashes use Argon2id.
 * - A well-formed email with no account still runs a fixed Argon2id verify;
 *   malformed credentials and blocked sources return before any hash work.
 * - Failed logins atomically increment the account counter and lock the account
 *   for 15 minutes at the 5th consecutive failure.
 * - Source throttling is applied first: a failure only counts against the
 *   account while the source is still within its budget (serialized via the
 *   atomic source counter), so concurrent bursts cannot lock the admin before
 *   the source is blocked.
 * - Success resets the counter/lock and stamps last_login_at.
 * - Locked, disabled, wrong-password and missing-account all return the same
 *   generic `null` so callers cannot distinguish them.
 */

export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_SECONDS = 15 * 60;
export const MAX_SOURCE_FAILURES = 4;
export const MAX_CONCURRENT_AUTH_CHECKS = 2;
const THROTTLE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const THROTTLE_RETENTION_MS = 24 * 60 * 60 * 1000;

// Shared across module reloads/bundles in this process. No waiting queue: even
// missing-account dummy hashes must acquire a slot before any expensive work.
const processState = globalThis as typeof globalThis & {
  __leonLoginSecurity?: { activeChecks: number; nextCleanupAt: number };
};
const loginSecurity = processState.__leonLoginSecurity ??= { activeChecks: 0, nextCleanupAt: 0 };

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

/** rawSource must be a trusted ingress identity, never raw request headers. */
export async function authenticateCredentials(
  rawEmail: unknown,
  rawPassword: unknown,
  rawSource?: string,
): Promise<AuthUser | null> {
  // Bound and reject malformed input before DB/hash work. Do not trim passwords.
  if (typeof rawEmail !== "string" || rawEmail.length > 320
    || typeof rawPassword !== "string" || !rawPassword || rawPassword.length > 1024) return null;
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (loginSecurity.activeChecks >= MAX_CONCURRENT_AUTH_CHECKS) return null;

  loginSecurity.activeChecks += 1;
  try {
    const sourceKey = rawSource ? sourceKeyOf(rawSource) : null;
    if (sourceKey && await isSourceBlocked(sourceKey)) return null;
    await cleanupExpiredThrottles();
    return await authenticateWithinLimit(email, rawPassword, sourceKey);
  } finally {
    loginSecurity.activeChecks -= 1;
  }
}

async function authenticateWithinLimit(
  email: string,
  password: string,
  sourceKey: string | null,
): Promise<AuthUser | null> {
  const startedAt = new Date();
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
    if (sourceKey) await registerSourceFailure(sourceKey);
    return null;
  }

  // Locked out: keep timing uniform with a real verify before rejecting.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verify(user.passwordHash, password);
    if (sourceKey) await registerSourceFailure(sourceKey);
    return null;
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    // Source-first: only punish the account while this source is still within
    // its failure budget. Concurrent failures serialize on the source counter,
    // so a burst cannot push the account to lock before the source is blocked.
    if (sourceKey) {
      const sourceCount = await registerSourceFailure(sourceKey);
      if (sourceCount <= MAX_SOURCE_FAILURES) {
        await registerFailedLogin(user.id);
      }
    } else {
      await registerFailedLogin(user.id);
    }
    return null;
  }

  if (!user.isActive) {
    if (sourceKey) await registerSourceFailure(sourceKey);
    return null;
  }

  // Compare the authorization/lock snapshot atomically: a slow valid hash must
  // not clear a newly acquired lock, undo disable/revocation, or accept a changed
  // password. A lost race is a generic failed login, not a new session.
  const updated = await prisma.user.updateMany({
    where: {
      id: user.id,
      isActive: true,
      sessionVersion: user.sessionVersion,
      lockedUntil: user.lockedUntil,
      passwordHash: user.passwordHash,
    },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  if (updated.count !== 1) return null;
  if (sourceKey) {
    await prisma.loginThrottle.deleteMany({
      where: {
        keyHash: sourceKey,
        updatedAt: { lte: startedAt },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: startedAt } }],
      },
    });
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    sessionVersion: user.sessionVersion,
  };
}

function sourceKeyOf(source: string): string {
  return createHmac("sha256", runtimeEnv.AUTH_SECRET).update(source).digest("hex");
}

/** Lazy, indexed, bounded maintenance; no timer/worker and no auth dependency. */
async function cleanupExpiredThrottles(): Promise<void> {
  const now = Date.now();
  if (now < loginSecurity.nextCleanupAt) return;
  loginSecurity.nextCleanupAt = now + THROTTLE_CLEANUP_INTERVAL_MS;
  try {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM login_throttles WHERE key_hash IN (
        SELECT key_hash FROM login_throttles
        WHERE updated_at < ${new Date(now - THROTTLE_RETENTION_MS)}
          AND (blocked_until IS NULL OR blocked_until <= ${new Date(now)})
        ORDER BY updated_at
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
      )
    `);
  } catch {
    // Retry only after the next interval; avoid exposing DB details or allowing
    // maintenance failures to turn into an authentication outage.
    logger.warn("auth.throttle_cleanup_failed");
  }
}

async function isSourceBlocked(keyHash: string): Promise<boolean> {
  const row = await prisma.loginThrottle.findUnique({ where: { keyHash }, select: { blockedUntil: true } });
  return Boolean(row?.blockedUntil && row.blockedUntil.getTime() > Date.now());
}

/** Atomically register a source failure; returns the post-increment failure count. */
async function registerSourceFailure(keyHash: string): Promise<number> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOCK_DURATION_SECONDS * 1000);
  const blockedUntil = new Date(now.getTime() + LOCK_DURATION_SECONDS * 1000);
  const rows = await prisma.$queryRaw<Array<{ failed_count: number }>>(Prisma.sql`
    INSERT INTO login_throttles (key_hash, failed_count, window_started_at, blocked_until, updated_at)
    VALUES (${keyHash}, 1, ${now}, NULL::TIMESTAMPTZ, ${now})
    ON CONFLICT (key_hash) DO UPDATE SET
      failed_count = CASE
        WHEN login_throttles.window_started_at < ${windowStart} THEN 1
        ELSE login_throttles.failed_count + 1
      END,
      window_started_at = CASE
        WHEN login_throttles.window_started_at < ${windowStart} THEN ${now}
        ELSE login_throttles.window_started_at
      END,
      blocked_until = CASE
        WHEN (CASE WHEN login_throttles.window_started_at < ${windowStart} THEN 1 ELSE login_throttles.failed_count + 1 END) >= ${MAX_SOURCE_FAILURES}
          THEN ${blockedUntil}
        ELSE NULL::TIMESTAMPTZ
      END,
      updated_at = ${now}
    RETURNING failed_count
  `);
  return rows[0]?.failed_count ?? 1;
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
