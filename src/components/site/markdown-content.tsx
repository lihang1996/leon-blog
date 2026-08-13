import { renderMarkdown } from "@/lib/markdown/markdown-renderer";

/**
 * Article body (architecture §12). Server Component — the Markdown is rendered
 * to static React/HTML on the server (Shiki highlighting included), so the
 * client receives no editor, no Markdown runtime, and no raw HTML.
 */
export async function MarkdownContent({ content }: { content: string }) {
  const nodes = await renderMarkdown(content);
  return <div className="markdown-body">{nodes}</div>;
}
