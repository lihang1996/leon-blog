import { AppError, ErrorCodes, unprocessable } from "@/lib/errors";

export function parseExpectedVersion(ifMatch: string | null): number {
  if (ifMatch === null) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, 428, "请提供 If-Match 版本号");
  }
  const match = /^"([0-9]+)"$/.exec(ifMatch.trim());
  const version = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(version) || version > 2_147_483_647) {
    throw unprocessable(ErrorCodes.VALIDATION_FAILED, "If-Match 必须是双引号包裹的有效非负整数版本号");
  }
  return version;
}
