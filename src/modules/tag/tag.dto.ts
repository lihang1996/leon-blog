/**
 * Tag DTOs — the only shapes allowed to cross the API/page boundary.
 */

export type PublicTagDTO = {
  name: string;
  slug: string;
  /** Number of PUBLISHED posts carrying this tag. */
  postCount: number;
};

export type AdminTagDTO = {
  id: string;
  name: string;
  slug: string;
  /** Total posts (any status) with this tag. */
  postCount: number;
};
