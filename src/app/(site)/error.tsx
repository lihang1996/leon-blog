"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function SiteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-16">
      <ErrorState title="页面出错了" description="加载失败，请重试或返回首页。" />
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={reset}
          className="focus-action-primary inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-text"
        >
          重试
        </button>
      </div>
    </div>
  );
}
