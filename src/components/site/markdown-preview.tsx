"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isAllowedImageUrl, isAllowedLinkUrl, isExternalLink } from "@/lib/markdown/markdown-policy";

/**
 * Client-safe Markdown preview (no rehype-raw, no Shiki). Used by the editor
 * toggle so unsaved content can render without a preview API. Independent
 * `/preview` still uses server `MarkdownContent`.
 */
export function MarkdownPreview({
  content,
  allowedImageHosts,
}: {
  content: string;
  allowedImageHosts: readonly string[];
}) {
  const hosts = new Set(allowedImageHosts);
  if (!content.trim()) {
    return <p className="text-sm text-text-muted">暂无正文</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
            if (!url || !isAllowedImageUrl(url, hosts)) return null;
            // Markdown images have unknown intrinsic size — same as the server renderer.
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={url} alt={alt ?? ""} loading="lazy" decoding="async" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
