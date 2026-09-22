/**
 * Pure Markdown/URL safety rules (architecture §12.3). No Next.js, no Prisma.
 * The rendering pipeline calls these before emitting any HTML.
 */
export const MAX_MARKDOWN_LENGTH = 200 * 1024; // 200 KB

/**
 * Languages the server-side Shiki highlighter registers (architecture §12.3).
 * Single source of truth — the renderer uses this for both `createHighlighter`
 * and fence-language validation so the lists can never drift apart.
 */
export const FENCE_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "html",
  "json",
  "sql",
  "bash",
  "sh",
  "shell",
  "md",
  "markdown",
  "prisma",
  "python",
  "go",
  "java",
  "rust",
  "yaml",
  "yml",
  "diff",
] as const;

const FENCE_LANGS_SET = new Set<string>(FENCE_LANGS);

/**
 * Resolve a `language-*` fence class to a Shiki language. Unknown info strings
 * make `codeToHtml` throw and crash the whole page render, so any unregistered
 * language falls back to plain-text highlighting.
 */
export function resolveFenceLanguage(languageClass: string): string {
  const requested = languageClass.slice("language-".length) || "text";
  return FENCE_LANGS_SET.has(requested) ? requested : "text";
}

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const RELATIVE_URL_BASE = "https://markdown.invalid";
const UNSAFE_URL_CHARACTERS = /[\\\u0000-\u0020\u007f]|%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i;

function normalizedRelativeUrl(url: string): string | null {
  if (!url.startsWith("/") || url.startsWith("//") || UNSAFE_URL_CHARACTERS.test(url)) return null;
  try {
    const parsed = new URL(url, RELATIVE_URL_BASE);
    if (parsed.origin !== RELATIVE_URL_BASE || parsed.pathname.startsWith("//")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * A link is allowed when it is a fragment, a site-relative path, or uses an
 * explicit http/https/mailto scheme. Blocks javascript:, data:, vbscript:,
 * file: and protocol-relative URLs (//host) which would inherit the page scheme.
 */
export function isAllowedLinkUrl(url: string): boolean {
  if (!url || UNSAFE_URL_CHARACTERS.test(url)) return false;
  if (url.startsWith("#")) return true;
  if (url.startsWith("/")) return normalizedRelativeUrl(url) !== null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol);
}

/**
 * Images are restricted to explicit HTTPS and an allow-listed hostname
 * (architecture §12.3 / §16.1). The same rule covers cover, SEO share and
 * Markdown images.
 */
export function normalizeImageUrl(url: string, allowedHosts: ReadonlySet<string>): string | null {
  if (!url || UNSAFE_URL_CHARACTERS.test(url)) return null;
  if (url.startsWith("/")) return normalizedRelativeUrl(url);
  try {
    if (!/^https:\/\//i.test(url)) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return allowedHosts.has(parsed.hostname.toLowerCase()) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function isAllowedImageUrl(url: string, allowedHosts: ReadonlySet<string>): boolean {
  return normalizeImageUrl(url, allowedHosts) !== null;
}

export type MarkdownBlock =
  | { kind: "code"; language: string; value: string }
  | { kind: "image"; alt: string; url: string }
  | { kind: "rule" }
  | { kind: "heading"; level: number; value: string }
  | { kind: "quote" | "paragraph"; value: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function imageLine(line: string): RegExpMatchArray | null {
  return line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
}

/**
 * The renderer's deliberately small Markdown dialect, shared with validation.
 * Images only occupy whole lines; inline/reference/HTML images are not rendered.
 * Backtick fences consume their contents (including an unclosed final fence).
 * Inline code and escaped image markers cannot match a whole-line image.
 */
export function segmentMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index++]!;
    if (!line.trim()) continue;
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (index < lines.length && !lines[index]!.startsWith("```")) code.push(lines[index++]!);
      index += 1;
      blocks.push({ kind: "code", language: line.slice(3).trim(), value: code.join("\n") });
      continue;
    }
    if (/^(---+|\*\*\*+)$/.test(line.trim())) {
      blocks.push({ kind: "rule" });
      continue;
    }
    const image = imageLine(line);
    if (image) {
      blocks.push({ kind: "image", alt: image[1]!, url: image[2]! });
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = [line.slice(2)];
      while (index < lines.length && lines[index]!.startsWith("> ")) quote.push(lines[index++]!.slice(2));
      blocks.push({ kind: "quote", value: quote.join(" ") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, value: heading[2]! });
      continue;
    }
    if (line.startsWith("- ") || /^\d+\.\s+/.test(line)) {
      const ordered = !line.startsWith("- ");
      const marker = ordered ? /^\d+\.\s+/ : /^- /;
      const items = [line.replace(marker, "")];
      while (index < lines.length && marker.test(lines[index]!)) items.push(lines[index++]!.replace(marker, ""));
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph = [line];
    while (index < lines.length && lines[index]!.trim()
      && !/^(#{1,6})\s|^> |^- |^```|^---+$|^\*\*\*+$/.test(lines[index]!) && !imageLine(lines[index]!)) {
      paragraph.push(lines[index++]!);
    }
    blocks.push({ kind: "paragraph", value: paragraph.join(" ") });
  }
  return blocks;
}

/** Extract only destinations that this renderer can actually fetch as images. */
export function extractMarkdownImageUrls(contentMd: string): string[] {
  return segmentMarkdownBlocks(contentMd).flatMap((block) => block.kind === "image" ? [block.url] : []);
}

export function isWithinMarkdownLimit(contentMd: string): boolean {
  return contentMd.length <= MAX_MARKDOWN_LENGTH;
}

/** External link needs rel="noopener noreferrer" when it is a full URL. */
export function isExternalLink(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
