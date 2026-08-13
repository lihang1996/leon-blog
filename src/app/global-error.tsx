"use client";

import "./globals.css";

/**
 * Root error boundary (architecture §5). Client Component — this is the last
 * fallback when an error escapes the root layout or any segment error boundary.
 * Renders a minimal reset UI so users are never left with a blank page.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-serif-cn text-2xl font-bold text-text">出错了</h1>
          <p className="mt-2 text-sm text-text-muted">页面加载失败，请重试或稍后再来。</p>
          <button
            type="button"
            onClick={reset}
            className="focus-action-primary mt-6 inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-text"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
