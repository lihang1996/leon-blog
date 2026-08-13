/**
 * Escape a user search keyword so `%`, `_` and `\` are treated literally when
 * passed to Prisma's `contains` filter (PostgreSQL LIKE's default escape
 * character is a backslash). Architecture §14.1 requires special characters to
 * be escaped — without this, searching "100%" or "a_b" returns every row that
 * merely contains a prefix/placeholder match.
 */
export function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (char) => `\\${char}`);
}
