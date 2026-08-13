import Link from "next/link";

export function ErrorState({
  title = "出错了",
  description = "页面加载失败，请稍后重试。",
  retryHref = "/",
  retryLabel = "返回首页",
}: {
  title?: string;
  description?: string;
  retryHref?: string;
  retryLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-danger/30 bg-surface px-6 py-16 text-center" role="alert">
      <h2 className="font-serif-cn text-xl font-bold text-danger">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">{description}</p>
      <p className="mt-6">
        <Link
          href={retryHref}
          className="focus-link inline-flex items-center gap-1.5 text-accent-text underline underline-offset-4 hover:text-accent"
        >
          {retryLabel} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
