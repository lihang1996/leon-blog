"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Search input (UI spec §8.1). A client island only to capture the keyword and
 * navigate to /search?q=…; the results themselves render server-side.
 */
export function SearchField({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="search-q" className="sr-only">
        搜索文章
      </label>
      <input
        id="search-q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="搜索标题或摘要…"
        className="focus-input h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-4 text-text transition-colors"
      />
      <button
        type="submit"
        className="focus-action-primary inline-flex h-11 items-center rounded-md bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-text"
      >
        搜索
      </button>
    </form>
  );
}
