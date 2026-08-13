/**
 * Pure slug helpers shared by post / category / tag policies (architecture §7.4).
 * No Next.js, no Prisma — safe to unit test in isolation.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Paths the app reserves at the root; slugs must never collide with them. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "login",
  "posts",
  "categories",
  "tags",
  "search",
  "sitemap",
  "robots",
  "opengraph-image",
  "not-found",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Normalize + validate: returns true when the value is an acceptable slug. */
export function isAcceptableSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  return isValidSlug(normalized) && !isReservedSlug(normalized);
}

/**
 * Slugify a title. Falls back to `post-{8 random}` when the title has no
 * usable latin slug — Chinese/emoji titles, and mixed titles whose CJK part
 * (the primary meaning) would be silently dropped by stripping. `randomPart`
 * is injectable for deterministic tests.
 */
const CJK_CHARS = /[㐀-䶿一-鿿豈-﫿]/;

export function slugifyTitle(title: string, randomPart: () => string = defaultRandom8): string {
  const normalized = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const hasCjkMeaning = CJK_CHARS.test(title);
  if (normalized.length > 0 && normalized.length <= 160 && !hasCjkMeaning) {
    return normalized;
  }
  return `post-${randomPart()}`;
}

export function defaultRandom8(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Collapse internal whitespace and trim (for tag names, architecture §8.2).
 * Case is preserved — only email/slug are normalized to lowercase.
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
