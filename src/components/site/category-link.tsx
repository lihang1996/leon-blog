import Link from "next/link";

export function CategoryLink({ name, slug }: { name: string; slug: string }) {
  return (
    <Link
      href={`/categories/${slug}`}
      className="focus-link text-accent-text underline underline-offset-4 hover:text-accent"
    >
      {name}
    </Link>
  );
}
