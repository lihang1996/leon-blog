import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(), verify: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(),
  findThrottle: vi.fn(), deleteThrottles: vi.fn(), executeRaw: vi.fn(), queryRaw: vi.fn(),
}));
vi.mock("@node-rs/argon2", () => ({ hash: mocks.hash, verify: mocks.verify }));
vi.mock("@/lib/env", () => ({ runtimeEnv: { AUTH_SECRET: "unit-test-secret-not-for-production" } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  user: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
  loginThrottle: { findUnique: mocks.findThrottle, deleteMany: mocks.deleteThrottles },
  $executeRaw: mocks.executeRaw, $queryRaw: mocks.queryRaw,
} }));

const user = {
  id: "admin-id", email: "admin@example.com", displayName: "Admin", passwordHash: "mock-hash",
  isActive: true, lockedUntil: null, sessionVersion: 3,
};
let service: typeof import("@/modules/auth/auth.service");

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  delete (globalThis as typeof globalThis & { __leonLoginSecurity?: unknown }).__leonLoginSecurity;
  mocks.findFirst.mockResolvedValue({ ...user });
  mocks.findThrottle.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.deleteThrottles.mockResolvedValue({ count: 1 });
  mocks.executeRaw.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([{ failed_count: 1 }]);
  mocks.hash.mockResolvedValue("dummy-hash");
  mocks.verify.mockResolvedValue(true);
  service = await import("@/modules/auth/auth.service");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function cleanupCalls() {
  return mocks.executeRaw.mock.calls.filter(([sql]) => sql.sql.includes("DELETE FROM login_throttles"));
}
function accountFailureCalls() {
  return mocks.executeRaw.mock.calls.filter(([sql]) => sql.sql.includes("failed_login_count = CASE"));
}

describe("credentials resource bounds (mocked Argon2 and DB only)", () => {
  it.each([
    [undefined, undefined], ["", "password"], ["not-email", "password"], ["a@b.com", ""],
    [123, "password"], ["a@b.com", {}], ["a".repeat(321), "password"],
    ["a@b.com", "x".repeat(1025)], ["a\0@b.com", "password"],
  ])("cheaply rejects malformed credentials (%j)", async (email, password) => {
    expect(await service.authenticateCredentials(email, password)).toBeNull();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("rejects a blocked source before account lookup, hash, or cleanup", async () => {
    mocks.findThrottle.mockResolvedValue({ blockedUntil: new Date(Date.now() + 10000) });
    expect(await service.authenticateCredentials(user.email, "password", "trusted-source")).toBeNull();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("rejects excess work without queuing and releases slots after completion", async () => {
    let finish!: (valid: boolean) => void;
    mocks.verify.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const first = service.authenticateCredentials(user.email, "password");
    const second = service.authenticateCredentials(user.email, "password");
    expect(service.MAX_CONCURRENT_AUTH_CHECKS).toBe(2);
    expect(await service.authenticateCredentials(user.email, "password")).toBeNull();
    // The deferred mock, not Argon2, exercises semaphore behavior deterministically.
    await vi.waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(2));
    finish(true);
    expect((await Promise.all([first, second])).every(Boolean)).toBe(true);
    expect(await service.authenticateCredentials(user.email, "password")).not.toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(3);
  });

  it("also bounds missing-account dummy work and releases slots on errors", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.hash.mockRejectedValueOnce(new Error("hash failed"));
    await expect(service.authenticateCredentials(user.email, "password")).rejects.toThrow("hash failed");
    mocks.findFirst.mockResolvedValue(user);
    expect(await service.authenticateCredentials(user.email, "password")).not.toBeNull();
  });

  it("runs a dummy verify for well-formed missing accounts", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await service.authenticateCredentials("missing@example.com", "password", "trusted-source")).toBeNull();
    expect(mocks.verify).toHaveBeenCalledWith("dummy-hash", expect.any(String));
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });
});

describe("account and source failure policy", () => {
  it("normalizes email but preserves password whitespace", async () => {
    expect(await service.authenticateCredentials(" ADMIN@EXAMPLE.COM ", " password ")).not.toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: user.email } }));
    expect(mocks.verify).toHaveBeenCalledWith(user.passwordHash, " password ");
  });

  it("updates only an unchanged active authorization and lock snapshot", async () => {
    const expiredLock = new Date(Date.now() - 1000);
    mocks.findFirst.mockResolvedValue({ ...user, lockedUntil: expiredLock });
    expect(await service.authenticateCredentials(user.email, "password")).not.toBeNull();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, isActive: true, sessionVersion: 3, lockedUntil: expiredLock, passwordHash: user.passwordHash },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: expect.any(Date) },
    });
  });

  it("rejects a lost success race without clearing a new source lock", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.authenticateCredentials(user.email, "password", "trusted-source")).toBeNull();
    expect(mocks.deleteThrottles).not.toHaveBeenCalled();
  });

  it.each([
    { ...user, isActive: false },
    { ...user, lockedUntil: new Date("2099-01-01") },
  ])("rejects disabled and locked accounts", async (account) => {
    mocks.findFirst.mockResolvedValue(account);
    expect(await service.authenticateCredentials(user.email, "password")).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([1, 4, 5])("only charges the account while source count %i is within budget", async (count) => {
    mocks.verify.mockResolvedValue(false);
    mocks.queryRaw.mockResolvedValue([{ failed_count: count }]);
    expect(await service.authenticateCredentials(user.email, "wrong", "trusted-source")).toBeNull();
    expect(accountFailureCalls()).toHaveLength(count <= service.MAX_SOURCE_FAILURES ? 1 : 0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("preserves account failure policy when no trusted source is available", async () => {
    mocks.verify.mockResolvedValue(false);
    expect(await service.authenticateCredentials(user.email, "wrong")).toBeNull();
    expect(accountFailureCalls()).toHaveLength(1);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("does not delete source failures recorded during a successful attempt", async () => {
    await service.authenticateCredentials(user.email, "password", "trusted-source");
    expect(mocks.deleteThrottles).toHaveBeenCalledWith({ where: {
      keyHash: expect.stringMatching(/^[a-f0-9]{64}$/), updatedAt: { lte: expect.any(Date) },
      OR: [{ blockedUntil: null }, { blockedUntil: { lte: expect.any(Date) } }],
    } });
  });
});

describe("lazy throttle cleanup", () => {
  it("bounds cleanup to one SQL batch every five minutes and retains 24 hours", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-01T12:00:00Z");
    vi.setSystemTime(now);
    await service.authenticateCredentials(user.email, "password");
    await service.authenticateCredentials(user.email, "password");
    expect(cleanupCalls()).toHaveLength(1);
    const sql = cleanupCalls()[0]![0];
    expect(sql.sql).toContain("LIMIT 1000");
    expect(sql.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql.sql).toContain("ORDER BY updated_at");
    expect(sql.values).toEqual([new Date("2026-08-31T12:00:00Z"), now]);
    vi.setSystemTime(now.getTime() + 5 * 60 * 1000);
    await service.authenticateCredentials(user.email, "password");
    expect(cleanupCalls()).toHaveLength(2);
  });

  it("keeps cleanup failures nonfatal without repeated retry storms", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.executeRaw.mockRejectedValueOnce(new Error("maintenance unavailable"));
    expect(await service.authenticateCredentials(user.email, "password")).not.toBeNull();
    expect(await service.authenticateCredentials(user.email, "password")).not.toBeNull();
    expect(cleanupCalls()).toHaveLength(1);
  });
});
