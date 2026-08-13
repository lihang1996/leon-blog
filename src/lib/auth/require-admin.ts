import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppError, ErrorCodes, authError } from "@/lib/errors";

/**
 * The authoritative admin check (architecture §11.2). Every protected page
 * read and every `/api/v1/admin/*` route handler calls this BEFORE touching
 * data. It validates the Auth.js cookie, then re-reads the user from the DB to
 * enforce `isActive` and `sessionVersion` (account disable / force-logout).
 */
export type AdminContext = {
  id: string;
  email: string;
  displayName: string;
  sessionVersion: number;
};

export async function requireAdmin(): Promise<AdminContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw authError(ErrorCodes.AUTH_REQUIRED, "请先登录");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, isActive: true, sessionVersion: true },
  });
  if (!user) throw authError(ErrorCodes.AUTH_INVALID, "会话无效，请重新登录");
  if (!user.isActive) {
    throw new AppError(ErrorCodes.ADMIN_DISABLED, 403, "账号已停用");
  }
  if (user.sessionVersion !== session.user.sessionVersion) {
    throw authError(ErrorCodes.AUTH_INVALID, "会话已失效，请重新登录");
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    sessionVersion: user.sessionVersion,
  };
}
