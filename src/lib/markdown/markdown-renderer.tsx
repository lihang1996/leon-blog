import "server-only";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createHighlighter, type Highlighter } from "shiki";
import { CodeBlock, escapeHtml, stripInlineShikiStyle } from "@/components/site/code-block";
import {
  FENCE_LANGS,
  isAllowedLinkUrl,
  isAllowedImageUrl,
  isExternalLink,
  resolveFenceLanguage,
} from "@/lib/markdown/markdown-policy";
import { getAllowedImageHosts } from "@/lib/env";

/**
 * Server-side Markdown rendering pipeline (architecture §12.2 / §12.3).
 *
 * - react-markdown (no rehype-raw): raw HTML never enters the tree.
 * - Links: only http/https/mailto + site-relative; external links get
 *   rel="noopener noreferrer".
 * - Images: HTTPS + allow-listed hostname only (cover/SEO/Markdown share the
 *   same policy); unsafe images are dropped.
 * - Code: Shiki highlighter is created once (memoized), highlighting runs
 *   server-side so the browser receives static HTML.
 */

let highlighterPromise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ["github-dark"],
    langs: [...FENCE_LANGS],
  });
  return highlighterPromise;
}

const ALLOWED_IMAGE_HOSTS = new Set(getAllowedImageHosts());

function highlightCode(highlighter: Highlighter, code: string, lang: string): string {
  return highlighter.codeToHtml(code, {
    lang,
    theme: "github-dark",
    transformers: [stripInlineShikiStyle],
  });
}

export async function renderMarkdown(markdown: string): Promise<React.ReactNode> {
  const highlighter = await getHighlighter();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Fenced code blocks are rendered by CodeBlock. The <pre> hast node
        // carries the raw text and `language-*` class — extracting here is
        // reliable (react-markdown v10 no longer passes `inline` or `parent`).
        pre({ node }) {
          const pre = node as {
            children?: Array<{
              type?: string;
              tagName?: string;
              properties?: { className?: string[] };
              children?: Array<{ type?: string; value?: string }>;
            }>;
          };
          const codeNode = pre.children?.find((child) => child.type === "element" && child.tagName === "code");
          const raw = codeNode?.children?.[0]?.value ?? "";
          const className = codeNode?.properties?.className;
          const langMatch = (className ?? []).find((name) => name.startsWith("language-"));

          if (langMatch) {
            // Unknown info strings make Shiki throw and crash the whole page
            // render — the policy resolves to a registered language or "text".
            const lang = resolveFenceLanguage(langMatch);
            const html = highlightCode(highlighter, raw.replace(/\n$/, ""), lang);
            return <CodeBlock html={html} language={lang} />;
          }
          // No info string — render a plain, escaped code block.
          const plain = `<pre><code>${escapeHtml(raw.replace(/\n$/, ""))}</code></pre>`;
          return <CodeBlock html={plain} language="text" />;
        },
        a({ href, children }) {
          if (href && isAllowedLinkUrl(href)) {
            const external = isExternalLink(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {children}
              </a>
            );
          }
          return <span>{children}</span>;
        },
        img({ src, alt }) {
          const url = typeof src === "string" ? src : null;
          if (!url || !isAllowedImageUrl(url, ALLOWED_IMAGE_HOSTS)) return null;
          // Controlled <img>: markdown images have unknown intrinsic size, so
          // next/image can't optimize them; lazy + async decoding keeps CLS low.
          // eslint-disable-next-line @next/next/no-img-element
          return <img src={url} alt={alt ?? ""} loading="lazy" decoding="async" />;
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
