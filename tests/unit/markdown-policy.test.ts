import { describe, expect, it } from "vitest";
import {
  FENCE_LANGS,
  isAllowedLinkUrl,
  isAllowedImageUrl,
  isExternalLink,
  isWithinMarkdownLimit,
  resolveFenceLanguage,
} from "@/lib/markdown/markdown-policy";

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
