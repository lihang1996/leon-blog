// Vitest stub for `next/cache`. Tests exercise pure logic and in-memory flows;
// caching is compiled in by Next at build time, so these are no-ops here.
/* eslint-disable @typescript-eslint/no-unused-vars */
export function cacheLife(_profile: string | number): void {
  return undefined;
}

export function cacheTag(..._tags: string[]): void {
  return undefined;
}

export function revalidatePath(_path: string): void {
  return undefined;
}

export function revalidateTag(_tag: string): void {
  return undefined;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export const unstable_noStore = (): void => undefined;
