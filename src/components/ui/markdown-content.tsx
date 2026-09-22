import React from "react";
import { isAllowedLinkUrl, normalizeImageUrl, segmentMarkdownBlocks } from "@/lib/markdown/markdown-policy";

const allowedImageHosts = new Set(
  (process.env.NEXT_PUBLIC_ALLOWED_IMAGE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

function InlineText({ value }: { value: string }) {
  // Consume escapes and unsupported inline image syntax as text, not links.
  const parts = value.split(/(\\[\\`*\[\]!()]|`[^`]+`|\*\*[^*]+\*\*|!?\[[^\]]*\]\([^)\s]+\))/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (/^\\[\\`*\[\]!()]$/.test(part)) {
      return <React.Fragment key={index}>{part.slice(1)}</React.Fragment>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index} className="rounded-md border border-[#F0D5C0] bg-[#FAF0E6] px-1.5 py-0.5 font-mono text-[0.9em] text-[#E65A00]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (link && isAllowedLinkUrl(link[2] ?? "")) {
      const url = link[2] ?? "";
      const external = /^https?:/i.test(url);
      return (
        <a
          key={index}
          href={url}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="text-[#E65A00] underline decoration-[#F0B48A] underline-offset-2 hover:decoration-[#E65A00]"
        >
          {link[1] || url}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
  const blocks = segmentMarkdownBlocks(content).map((block, index) => {
    switch (block.kind) {
      case "code":
        return (
          <div key={`code-${index}`} className="code-container overflow-hidden">
            <div className="code-header">
              <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" /><span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" /></div>
              <span className="font-mono text-xs text-[#A3BE8C]">{block.language || "code"}</span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-6 sm:p-6 sm:text-sm"><code>{block.value}</code></pre>
          </div>
        );
      case "rule":
        return <hr key={`hr-${index}`} className="border-t border-[#E2D6C5]" />;
      case "image": {
        const url = normalizeImageUrl(block.url, allowedImageHosts);
        return url ? (
          <img
            key={`img-${index}`}
            src={url}
            alt={block.alt}
            className="max-w-full rounded-2xl border border-[#EEDFC9]"
            loading="lazy"
          />
        ) : (
          <p key={`img-${index}`} role="note" className="rounded-2xl border border-[#EEDFC9] p-4 text-sm text-[#8C8375]">
            图片地址不被允许{block.alt ? `：${block.alt}` : ""}
          </p>
        );
      }
      case "quote":
        return <blockquote key={`quote-${index}`} className="rounded-r-2xl border-l-4 border-[#E65A00] bg-[#FFF9F2] p-5 font-serif italic leading-8 text-[#3A332C]"><InlineText value={block.value} /></blockquote>;
      case "heading": {
        const sizes: Record<number, string> = {
          1: "text-3xl",
          2: "text-2xl",
          3: "text-xl",
          4: "text-lg",
          5: "text-base",
          6: "text-sm uppercase tracking-wide",
        };
        return React.createElement(`h${block.level}`, { key: `heading-${index}`, className: `${sizes[block.level]} font-extrabold font-serif text-[#1A1A1A]` }, <InlineText value={block.value} />);
      }
      case "list":
        return block.ordered ? (
          <ol key={`olist-${index}`} className="list-decimal space-y-2 pl-6 marker:text-[#E65A00] marker:font-semibold">{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ol>
        ) : (
          <ul key={`list-${index}`} className="list-disc space-y-2 pl-6 marker:text-[#E65A00]">{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ul>
        );
      case "paragraph":
        return <p key={`paragraph-${index}`} className={compact ? "leading-7" : "leading-8 text-[#3A332C]"}><InlineText value={block.value} /></p>;
    }
  });

  return <div className={`${compact ? "space-y-3" : "space-y-6"} markdown-body post-prose`}>{blocks}</div>;
}
