"use client";

import { Button } from "../../ui/button";

/**
 * Shared cache-refresh warning (FR-03 / delivery §4.2.1-2): a 2xx business
 * write whose `X-Public-Cache-Status` was `failed` (or missing/illegal →
 * unknown). The write itself is confirmed, so the ONLY actions offered are
 * the fixed-set refresh retry and — where the caller allows it — leaving;
 * never a repeat of the business write.
 */
export function CacheRefreshWarning({
  message,
  onRetry,
  refreshing,
  extraActions,
}: {
  message: string;
  onRetry: () => void;
  refreshing: boolean;
  extraActions?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="p-3.5 rounded-2xl text-xs sm:text-sm font-semibold bg-[#FFF8E1] text-[#8A6100] border border-[#F0D98C] animate-fade-in"
    >
      <p>{message}</p>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={onRetry} disabled={refreshing} size="sm">
          {refreshing ? "正在刷新…" : "重试公开内容刷新"}
        </Button>
        {extraActions}
      </div>
    </div>
  );
}
