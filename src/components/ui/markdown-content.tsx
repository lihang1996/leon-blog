import React from "react";

/** Only allow safe URL schemes for links/images written in Markdown. */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(https?:|mailto:)/i.test(trimmed)) return true;
  return trimmed.startsWith("/") || trimmed.startsWith("#") || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

function InlineText({ value }: { value: string }) {
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]*\]\([^)\s]+\))/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index} className="rounded-md border border-[#F0D5C0] bg-[#FAF0E6] px-1.5 py-0.5 font-mono text-[0.9em] text-[#E65A00]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (link && isSafeUrl(link[2] ?? "")) {
      const url = link[2] ?? "";
      const external = /^https?:/i.test(url);
      return (
        <a
          key={index}
          href={url}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="text-[#E65A00] underline decoration-[#F0B48A] underline-offset-2 hover:decoration-[#E65A00]"
        >
          {link[1] || url}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

/** A line that is only an image: ![alt](url) */
function isImageLine(line: string): boolean {
  return /^!\[[^\]]*\]\([^)\s]+\)$/.test(line.trim());
}

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(
        <div key={`code-${index}`} className="code-container overflow-hidden">
          <div className="code-header">
            <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" /><span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" /></div>
            <span className="font-mono text-xs text-[#A3BE8C]">{language || "code"}</span>
          </div>
          <pre className="overflow-x-auto p-4 text-xs leading-6 sm:p-6 sm:text-sm"><code>{code.join("\n")}</code></pre>
        </div>
      );
      continue;
    }

    if (/^(---+|\*\*\*+)$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${index}`} className="border-t border-[#E2D6C5]" />);
      index += 1;
      continue;
    }

    if (isImageLine(line)) {
      const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      const url = image?.[2] ?? "";
      if (isSafeUrl(url)) {
        blocks.push(
          <img
            key={`img-${index}`}
            src={url}
            alt={image?.[1] ?? ""}
            className="max-w-full rounded-2xl border border-[#EEDFC9]"
            loading="lazy"
          />
        );
      }
      index += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith("> ")) {
        quote.push((lines[index] ?? "").slice(2));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`} className="rounded-r-2xl border-l-4 border-[#E65A00] bg-[#FFF9F2] p-5 font-serif italic leading-8 text-[#3A332C]"><InlineText value={quote.join(" ")} /></blockquote>);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const sizes: Record<number, string> = {
        1: "text-3xl",
        2: "text-2xl",
        3: "text-xl",
        4: "text-lg",
        5: "text-base",
        6: "text-sm uppercase tracking-wide",
      };
      blocks.push(React.createElement(`h${level}`, { key: `heading-${index}`, className: `${sizes[level]} font-extrabold font-serif text-[#1A1A1A]` }, <InlineText value={heading[2] ?? ""} />));
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith("- ")) {
        items.push((lines[index] ?? "").slice(2));
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`} className="list-disc space-y-2 pl-6 marker:text-[#E65A00]">{items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={`olist-${index}`} className="list-decimal space-y-2 pl-6 marker:text-[#E65A00] marker:font-semibold">{items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{1,6})\s|^> |^- |^```|^---+$|^\*\*\*+$/.test(lines[index] ?? "") && !isImageLine(lines[index] ?? "")) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className={compact ? "leading-7" : "leading-8 text-[#3A332C]"}><InlineText value={paragraph.join(" ")} /></p>);
  }

  return <div className={`${compact ? "space-y-3" : "space-y-6"} markdown-body post-prose`}>{blocks}</div>;
}
