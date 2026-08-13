import type { ShikiTransformer } from "shiki";

/**
 * Server-side code block (architecture §12). Receives the fully highlighted
 * HTML from the Shiki pipeline and renders it with a language label. The
 * Shiki `<pre>` is styled by styles/markdown.css (dark ink background, light
 * text, horizontal scroll inside the block only).
 */

/** Removes Shiki's inline background/color so markdown.css owns the look. */
export const stripInlineShikiStyle: ShikiTransformer = {
  pre(node) {
    if (node.properties && typeof node.properties === "object") {
      delete node.properties.style;
    }
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function CodeBlock({ html, language }: { html: string; language: string }) {
  return (
    <figure className="code-block my-6">
      <figcaption className="code-block-label flex items-center gap-2 text-xs text-text-muted">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-accent" />
        <span>{language}</span>
      </figcaption>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </figure>
  );
}
