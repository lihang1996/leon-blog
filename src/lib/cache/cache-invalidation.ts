/**
 * Pure cache invalidation plan builder (architecture §13.3).
 * Business services return a PostChangeSet; the caller applies the plan only
 * AFTER the DB transaction commits. Computed here so it is unit-testable
 * without Next.js.
 */

export const CACHE_TAGS = {
  posts: "posts",
  categories: "categories",
  tags: "tags",
  post: (slug: string) => `post:${slug}`,
  category: (slug: string) => `category:${slug}`,
  tag: (slug: string) => `tag:${slug}`,
} as const;

export type PostChangeSet = {
  oldSlug: string | null;
  newSlug: string;
  oldCategorySlug: string | null;
  newCategorySlug: string | null;
  oldTagSlugs: string[];
  newTagSlugs: string[];
};

export type InvalidationPlan = {
  paths: string[];
  tags: string[];
};

export function dedupe(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/**
 * Which paths/tags to invalidate after a post is created/updated/published/
 * archived. The union of old + new associations guarantees we clear both the
 * previous rendering and the new one.
 */
export function buildInvalidationPlan(changeSet: PostChangeSet): InvalidationPlan {
  const paths = new Set<string>();
  const tags = new Set<string>();

  // Home + public post list always reflect the latest published set.
  paths.add("/");
  paths.add("/posts");
  tags.add(CACHE_TAGS.posts);

  // Post detail: old slug (if any) + current slug. Callers building a plan for
  // category/tag CRUD pass an empty `newSlug`; only add the post-detail leg when
  // there is an actual slug to invalidate.
  const postSlugs = new Set<string>();
  if (changeSet.oldSlug) postSlugs.add(changeSet.oldSlug);
  if (changeSet.newSlug) postSlugs.add(changeSet.newSlug);
  for (const slug of postSlugs) {
    paths.add(`/posts/${slug}`);
    tags.add(CACHE_TAGS.post(slug));
  }

  // Category: old + new; index too when any category association changed.
  const categorySlugs = new Set<string>();
  if (changeSet.oldCategorySlug) categorySlugs.add(changeSet.oldCategorySlug);
  if (changeSet.newCategorySlug) categorySlugs.add(changeSet.newCategorySlug);
  if (categorySlugs.size > 0) {
    paths.add("/categories");
    tags.add(CACHE_TAGS.categories);
    for (const slug of categorySlugs) {
      paths.add(`/categories/${slug}`);
      tags.add(CACHE_TAGS.category(slug));
    }
  }

  // Tags: old + new; index too when any tag association changed.
  const tagSlugs = new Set([...changeSet.oldTagSlugs, ...changeSet.newTagSlugs]);
  if (tagSlugs.size > 0) {
    paths.add("/tags");
    tags.add(CACHE_TAGS.tags);
    for (const slug of tagSlugs) {
      paths.add(`/tags/${slug}`);
      tags.add(CACHE_TAGS.tag(slug));
    }
  }

  return { paths: dedupe(paths), tags: dedupe(tags) };
}

/** Category CRUD plan: index + affected post detail slugs. */
export function buildCategoryInvalidationPlan(args: {
  oldSlug: string | null;
  newSlug: string;
  affectedPostSlugs: string[];
}): InvalidationPlan {
  const plan = buildInvalidationPlan({
    oldSlug: null,
    newSlug: "",
    oldCategorySlug: args.oldSlug,
    newCategorySlug: args.newSlug,
    oldTagSlugs: [],
    newTagSlugs: [],
  });
  for (const slug of args.affectedPostSlugs) {
    plan.paths.push(`/posts/${slug}`);
    plan.tags.push(CACHE_TAGS.post(slug));
  }
  return { paths: dedupe(plan.paths), tags: dedupe(plan.tags) };
}

/** Tag CRUD plan: index + affected post detail slugs. */
export function buildTagInvalidationPlan(args: {
  oldSlug: string | null;
  newSlug: string;
  affectedPostSlugs: string[];
}): InvalidationPlan {
  const plan = buildInvalidationPlan({
    oldSlug: null,
    newSlug: "",
    oldCategorySlug: null,
    newCategorySlug: null,
    oldTagSlugs: args.oldSlug ? [args.oldSlug] : [],
    newTagSlugs: [args.newSlug],
  });
  for (const slug of args.affectedPostSlugs) {
    plan.paths.push(`/posts/${slug}`);
    plan.tags.push(CACHE_TAGS.post(slug));
  }
  return { paths: dedupe(plan.paths), tags: dedupe(plan.tags) };
}

/**
 * Applies a plan. Must only be called AFTER a successful DB commit
 * (architecture §13.4). Failure is logged, never throws back to the caller —
 * the DB stays the source of truth.
 */
/** Immediate expire profile for Route Handler mutations (read-your-writes). */
export const IMMEDIATE_REVALIDATE = { expire: 0 } as const;

export async function applyInvalidationPlan(
  plan: InvalidationPlan,
  deps: {
    revalidatePath: (path: string) => void;
    /** Second arg must force immediate expiry — `"max"` would SWR-serve stale lists after publish. */
    revalidateTag: (tag: string, profile: typeof IMMEDIATE_REVALIDATE) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  for (const path of plan.paths) {
    try {
      deps.revalidatePath(path);
    } catch (error) {
      deps.onError(`Cache path invalidation failed (${path}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const tag of plan.tags) {
    try {
      // Route Handlers cannot call updateTag(); { expire: 0 } blocks until fresh.
      deps.revalidateTag(tag, IMMEDIATE_REVALIDATE);
    } catch (error) {
      deps.onError(`Cache tag invalidation failed (${tag}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
