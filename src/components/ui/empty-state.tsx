import Link from "next/link";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
      <h2 className="font-serif-cn text-xl font-bold text-text">{title}</h2>
      {description ? <p className="mt-2 text-sm text-text-muted">{description}</p> : null}
      {action ? (
        <p className="mt-6">
          <Link
            href={action.href}
            className="focus-link inline-flex items-center gap-1.5 text-accent-text underline underline-offset-4 hover:text-accent"
          >
            {action.label} <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
    </div>
  );
}
