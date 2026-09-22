import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateCredentials, MAX_FAILED_LOGINS, MAX_SOURCE_FAILURES } from "@/modules/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { ErrorCodes, AppError } from "@/lib/errors";
import { resetDatabase, createAdminUser, TEST_ADMIN } from "./helpers";

/**
 * PRD §7.5 — 登录成功、失败和退出；未登录用户不能访问管理接口。
 * Credentials run against the real DB + Argon2id (account lockout, uniform
 * failure); requireAdmin is exercised against the DB with a mocked Auth.js
 * session (the cookie layer itself is covered by the E2E).
 */
vi.mock("@/auth", () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { auth as authMock } from "@/auth";

/** Auth.js `auth` is heavily overloaded; narrow it to the session mock API. */
const mockedAuth = authMock as unknown as {
  mockResolvedValue: (value: Session | null) => void;
  mockClear: () => void;
};

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise;
    throw new Error("expected an AppError but none was thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    expect((error as AppError).status).toBe(status);
  }
}

describe("authenticateCredentials", () => {
  it("succeeds with valid credentials", async () => {
    await createAdminUser();
    const result = await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password);
    expect(result).not.toBeNull();
    expect(result!.email).toBe(TEST_ADMIN.email);
  });

  it("returns null for a wrong password and increments the failure counter", async () => {
    await createAdminUser();
    const result = await authenticateCredentials(TEST_ADMIN.email, "wrong-password");
    expect(result).toBeNull();

    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.failedLoginCount).toBe(1);
  });

  it("locks the account after MAX_FAILED_LOGINS consecutive failures", async () => {
    await createAdminUser();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await authenticateCredentials(TEST_ADMIN.email, "wrong-password");
    }
    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.failedLoginCount).toBe(MAX_FAILED_LOGINS);
    expect(user.lockedUntil).not.toBeNull();

    // Even the correct password is rejected while locked.
    const lockedResult = await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password);
    expect(lockedResult).toBeNull();
  });

  it("does not reveal whether an email exists", async () => {
    const missing = await authenticateCredentials("nobody@test.dev", TEST_ADMIN.password);
    expect(missing).toBeNull();
  });

  it("does not instantly re-lock after the lock has expired (FIND-210)", async () => {
    await createAdminUser();
    // Simulate a lock whose window already elapsed: stale count + past locked_until.
    const expired = new Date(Date.now() - 1000);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    await prisma.user.update({
      where: { id: admin.id },
      data: { failedLoginCount: MAX_FAILED_LOGINS, lockedUntil: expired },
    });

    const result = await authenticateCredentials(TEST_ADMIN.email, "wrong-password");
    expect(result).toBeNull();

    // A single failure in a fresh window must NOT re-lock from the stale count.
    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.failedLoginCount).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it("resets the counter and lock on a successful login", async () => {
    await createAdminUser();
    await authenticateCredentials(TEST_ADMIN.email, "wrong-password");
    await authenticateCredentials(TEST_ADMIN.email, "wrong-password");

    const result = await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password);
    expect(result).not.toBeNull();

    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("throttles one source before it can lock a known account", async () => {
    await createAdminUser();
    for (let i = 0; i < MAX_SOURCE_FAILURES; i++) {
      await authenticateCredentials(TEST_ADMIN.email, "wrong-password", "198.51.100.10");
    }

    expect(await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password, "198.51.100.10")).toBeNull();
    expect(await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password, "198.51.100.11")).not.toBeNull();

    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.lockedUntil).toBeNull();
  });

  it("does not lock the account when concurrent failures from one source race past the pre-check", async () => {
    await createAdminUser();
    // Five concurrent wrong passwords: source serializes to 4 account-counting
    // failures (MAX_SOURCE_FAILURES) so the account must not reach lock.
    await Promise.all(
      Array.from({ length: MAX_FAILED_LOGINS }, () =>
        authenticateCredentials(TEST_ADMIN.email, "wrong-password", "203.0.113.50"),
      ),
    );

    const user = await prisma.user.findFirstOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLoginCount).toBeLessThan(MAX_FAILED_LOGINS);
    expect(await authenticateCredentials(TEST_ADMIN.email, TEST_ADMIN.password, "203.0.113.51")).not.toBeNull();
  });
});

describe("requireAdmin (authoritative check)", () => {
  it("returns 401 AUTH_REQUIRED when there is no session", async () => {
    mockedAuth.mockResolvedValue(null);
    await expectError(requireAdmin(), ErrorCodes.AUTH_REQUIRED, 401);
  });

  it("returns 403 ADMIN_DISABLED for an inactive account", async () => {
    const user = await createAdminUser({ isActive: false });
    mockedAuth.mockResolvedValue({
      user: { id: user.id, displayName: "Test Admin", sessionVersion: 1 },
      expires: "2099-01-01T00:00:00.000Z",
    });
    await expectError(requireAdmin(), ErrorCodes.ADMIN_DISABLED, 403);
  });

  it("returns 401 AUTH_INVALID on sessionVersion mismatch", async () => {
    const user = await createAdminUser({ sessionVersion: 1 });
    mockedAuth.mockResolvedValue({
      user: { id: user.id, displayName: "Test Admin", sessionVersion: 999 },
      expires: "2099-01-01T00:00:00.000Z",
    });
    await expectError(requireAdmin(), ErrorCodes.AUTH_INVALID, 401);
  });

  it("returns the admin context for a valid active session", async () => {
    const user = await createAdminUser();
    mockedAuth.mockResolvedValue({
      user: { id: user.id, displayName: "Test Admin", sessionVersion: 1 },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const admin = await requireAdmin();
    expect(admin.id).toBe(user.id);
    expect(admin.email).toBe(TEST_ADMIN.email);
  });
});
