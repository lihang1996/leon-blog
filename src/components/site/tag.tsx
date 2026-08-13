import Link from "next/link";

export function Tag({ name, slug }: { name: string; slug: string }) {
  return (
    <Link
      href={`/tags/${slug}`}
      className="focus-surface inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent-text hover:text-accent-text"
    >
      #{name}
    </Link>
  );
}
