import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveAdminCallbackUrl } from "@/lib/auth/callback-url";
import { AppError, ErrorCodes } from "@/lib/errors";
import { siteUrl } from "@/lib/env";

/** Server-only login gate. Query parameters never authorize session deletion. */
export async function resolveLoginState(input: {
  reason?: string;
  callbackUrl?: string;
}): Promise<{ clearInvalidSession: boolean; callbackUrl: string }> {
  const callbackUrl = resolveAdminCallbackUrl(input.callbackUrl, siteUrl);
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === ErrorCodes.AUTH_REQUIRED) {
        return { clearInvalidSession: false, callbackUrl };
      }
      if (error.code === ErrorCodes.AUTH_INVALID || error.code === ErrorCodes.ADMIN_DISABLED) {
        return { clearInvalidSession: true, callbackUrl };
      }
    }
    // A DB/network failure is not proof that the session is invalid.
    throw error;
  }
  // Next redirect throws; keep it outside the authorization catch.
  redirect(callbackUrl);
}
