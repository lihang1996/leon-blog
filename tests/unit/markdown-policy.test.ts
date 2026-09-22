import { describe, expect, it } from "vitest";
import {
  FENCE_LANGS,
  isAllowedLinkUrl,
  isAllowedImageUrl,
  isExternalLink,
  isWithinMarkdownLimit,
  resolveFenceLanguage,
  extractMarkdownImageUrls,
  normalizeImageUrl,
  segmentMarkdownBlocks,
} from "@/lib/markdown/markdown-policy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "@/components/ui/markdown-content";

const allowedHosts = new Set(["images.example.com", "avatars.githubusercontent.com"]);

describe("isAllowedLinkUrl", () => {
  it("allows http/https/mailto and site-relative links", () => {
    expect(isAllowedLinkUrl("https://example.com/a")).toBe(true);
    expect(isAllowedLinkUrl("http://example.com/a")).toBe(true);
    expect(isAllowedLinkUrl("mailto:hi@example.com")).toBe(true);
    expect(isAllowedLinkUrl("/posts/foo")).toBe(true);
    expect(isAllowedLinkUrl("#section")).toBe(true);
  });

  it("rejects dangerous and protocol-relative URLs", () => {
    expect(isAllowedLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkUrl("data:text/html,<script>")).toBe(false);
    expect(isAllowedLinkUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isAllowedLinkUrl("//evil.example.com")).toBe(false);
    expect(isAllowedLinkUrl("")).toBe(false);
  });
});

describe("isAllowedImageUrl", () => {
  it("only allows HTTPS from the host whitelist", () => {
    expect(isAllowedImageUrl("https://images.example.com/p.png", allowedHosts)).toBe(true);
    expect(isAllowedImageUrl("https://avatars.githubusercontent.com/a.png", allowedHosts)).toBe(true);
    expect(isAllowedImageUrl("http://images.example.com/p.png", allowedHosts)).toBe(false);
    expect(isAllowedImageUrl("https://evil.example.com/p.png", allowedHosts)).toBe(false);
    expect(isAllowedImageUrl("data:image/png;base64,AAAA", allowedHosts)).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)", allowedHosts)).toBe(false);
    expect(isAllowedImageUrl("not a url", allowedHosts)).toBe(false);
  });

  it("matches hostnames case-insensitively", () => {
    expect(isAllowedImageUrl("https://IMAGES.EXAMPLE.COM/p.png", allowedHosts)).toBe(true);
  });

  it("allows safe site-relative images but rejects protocol-relative paths", () => {
    expect(isAllowedImageUrl("/images/posts/cover.png", allowedHosts)).toBe(true);
    expect(isAllowedImageUrl("//evil.example.com/cover.png", allowedHosts)).toBe(false);
  });

  it("extracts whole-line Markdown image destinations", () => {
    expect(extractMarkdownImageUrls("![本地](/images/a.png)\n![远程](https://images.example.com/b.png)"))
      .toEqual(["/images/a.png", "https://images.example.com/b.png"]);
  });

  it.each([
    String.raw`/\evil.example/image.png`, String.raw`/images\foo.png`,
    "https://images.example.com/\nimage.png", "https://images.example.com/\timage.png",
    String.raw`https:\\images.example.com\image.png`, "/images/\0foo.png",
    "/%5cevil.example/image.png", "/images/%0afoo.png", "/images/%7ffoo.png",
    "/a/..//evil.example/image.png", "https://user:pass@images.example.com/image.png",
  ])("rejects URL parser ambiguities: %s", (url) => {
    expect(isAllowedImageUrl(url, allowedHosts)).toBe(false);
    expect(normalizeImageUrl(url, allowedHosts)).toBeNull();
  });

  it("normalizes safe local and allowlisted destinations", () => {
    expect(normalizeImageUrl("/images/a/../b.png?q=1#x", allowedHosts)).toBe("/images/b.png?q=1#x");
    expect(normalizeImageUrl("https://IMAGES.example.com:443/a/../b.png", allowedHosts)).toBe("https://images.example.com/b.png");
  });
});

describe("shared minimal Markdown segmentation", () => {
  const examples = [
    "```md", "![fenced](https://evil.example/fence.png)", "```", "",
    "`![inline-code](https://evil.example/code.png)`", "",
    String.raw`\![escaped](https://evil.example/escaped.png)`, "",
    "text ![unsupported-inline](https://evil.example/inline.png)", "",
    "> ![quoted](https://evil.example/quote.png)", "",
    "- ![list](https://evil.example/list.png)", "",
    "![actual](/images/a/../real.png)", "",
    "```", "![unclosed](https://evil.example/unclosed.png)",
  ].join("\n");

  it("skips code, escapes and unsupported image forms without widening syntax", () => {
    expect(extractMarkdownImageUrls(examples)).toEqual(["/images/a/../real.png"]);
    expect(segmentMarkdownBlocks(examples).filter((block) => block.kind === "image")).toHaveLength(1);
    const html = renderToStaticMarkup(createElement(MarkdownContent, { content: examples }));
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('src="/images/real.png"');
    expect(html).not.toContain('href="https://evil.example/code.png"');
  });

  it("shows a blocked image instead of silently dropping it", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, {
      content: String.raw`![blocked](/\evil.example/image.png)`,
    }));
    expect(html).not.toContain("<img");
    expect(html).toContain("图片地址不被允许");
  });
});

describe("resolveFenceLanguage", () => {
  it("accepts registered languages and the empty/plain-text case", () => {
    expect(resolveFenceLanguage("language-ts")).toBe("ts");
    expect(resolveFenceLanguage("language-bash")).toBe("bash");
    expect(resolveFenceLanguage("language-")).toBe("text");
  });

  it("falls back to text for unknown info strings", () => {
    expect(resolveFenceLanguage("language-not-a-real-lang")).toBe("text");
    expect(resolveFenceLanguage("language-javascript\" onmouseover=\"x")).toBe("text");
  });

  it("keeps every FENCE_LANGS entry resolvable to itself", () => {
    for (const lang of FENCE_LANGS) {
      expect(resolveFenceLanguage(`language-${lang}`)).toBe(lang);
    }
  });
});

describe("external / size helpers", () => {
  it("detects external links", () => {
    expect(isExternalLink("https://example.com")).toBe(true);
    expect(isExternalLink("/posts/foo")).toBe(false);
  });

  it("enforces the markdown size limit", () => {
    expect(isWithinMarkdownLimit("small")).toBe(true);
    expect(isWithinMarkdownLimit("x".repeat(200 * 1024 + 1))).toBe(false);
  });
});
