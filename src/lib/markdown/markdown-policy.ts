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
const DISALLOWED_IMAGE_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:", "file:"]);

/**
 * A link is allowed when it is a fragment, a site-relative path, or uses an
 * explicit http/https/mailto scheme. Blocks javascript:, data:, vbscript:,
 * file: and protocol-relative URLs (//host) which would inherit the page scheme.
 */
export function isAllowedLinkUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("#")) return true;
  if (url.startsWith("/") && !url.startsWith("//")) return true;

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
export function isAllowedImageUrl(url: string, allowedHosts: ReadonlySet<string>): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (DISALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol)) return false;
  return allowedHosts.has(parsed.hostname.toLowerCase());
}

export function isWithinMarkdownLimit(contentMd: string): boolean {
  return contentMd.length <= MAX_MARKDOWN_LENGTH;
}

/** External link needs rel="noopener noreferrer" when it is a full URL. */
export function isExternalLink(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
