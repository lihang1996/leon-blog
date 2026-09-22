import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { validateTagInput } from "./tag-policy";
import { tagRepository, type AdminTagRow, type PublicTagRow } from "./tag.repository";
import { type AdminTagDTO, type PublicTagDTO } from "./tag.dto";
import type { CreateTagInput, UpdateTagInput } from "./tag.schemas";
import { CACHE_TAGS } from "@/lib/cache/cache-invalidation";
import { normalizeTagName } from "@/lib/slug";
import { ErrorCodes, conflict, notFound, unprocessable } from "@/lib/errors";

export type TagChangeSet = {
  oldSlug: string | null;
  newSlug: string;
  affectedPostSlugs: string[];
};

function toPublicDTO(row: PublicTagRow): PublicTagDTO {
  return { name: row.name, slug: row.slug, postCount: row._count.postTags };
}

function toAdminDTO(row: AdminTagRow): AdminTagDTO {
  return { id: row.id, version: row.version, name: row.name, slug: row.slug, postCount: row._count.postTags };
}

function validate(input: { name: string; slug: string }): void {
  const issues = validateTagInput(input);
  if (issues.length > 0) {
    throw unprocessable(ErrorCodes.VALIDATION_FAILED, issues[0]!.message, issues);
  }
}

async function listPublicTagsCached(): Promise<PublicTagDTO[]> {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.tags);
  const rows = await tagRepository.findPublicTags();
  return rows.map(toPublicDTO);
}

async function getPublicTagBySlugCached(slug: string): Promise<PublicTagDTO | null> {
  "use cache";
  cacheLife("blog");
  cacheTag(CACHE_TAGS.tags, CACHE_TAGS.tag(slug));
  const row = await tagRepository.findPublicBySlug(slug);
  return row ? toPublicDTO(row) : null;
}

export const tagService = {
  // ---- Queries -----------------------------------------------------------

  listPublicTags: listPublicTagsCached,
  getPublicTagBySlug: getPublicTagBySlugCached,

  async listAdminTags(): Promise<AdminTagDTO[]> {
    const rows = await tagRepository.listAdminTags();
    return rows.map(toAdminDTO);
  },

  // ---- Commands ----------------------------------------------------------

  async createTag(input: CreateTagInput): Promise<{ tag: AdminTagDTO; changeSet: TagChangeSet }> {
    const name = normalizeTagName(input.name);
    const slug = input.slug.trim().toLowerCase();
    validate({ name, slug });

    if (await tagRepository.nameExists(name)) {
      throw conflict(ErrorCodes.TAG_NAME_EXISTS, "标签名称已存在");
    }
    if (await tagRepository.slugExists(slug)) {
      throw conflict(ErrorCodes.TAG_SLUG_EXISTS, "标签 slug 已存在");
    }

    const row = await tagRepository.create({ name, slug });
    return { tag: toAdminDTO(row), changeSet: { oldSlug: null, newSlug: slug, affectedPostSlugs: [] } };
  },

  async updateTag(
    id: string,
    input: UpdateTagInput,
  ): Promise<{ tag: AdminTagDTO; changeSet: TagChangeSet }> {
    const existing = await tagRepository.findById(id);
    if (!existing) throw notFound(ErrorCodes.TAG_NOT_FOUND, "标签不存在");
    if (existing.version !== input.version) {
      throw conflict(ErrorCodes.TAG_CONCURRENT_MODIFICATION, "标签已被其他操作修改，请刷新后重试");
    }

    const name = normalizeTagName(input.name ?? existing.name);
    const slug = (input.slug ?? existing.slug).trim().toLowerCase();
    validate({ name, slug });

    if (await tagRepository.nameExists(name, id)) {
      throw conflict(ErrorCodes.TAG_NAME_EXISTS, "标签名称已存在");
    }
    if (await tagRepository.slugExists(slug, id)) {
      throw conflict(ErrorCodes.TAG_SLUG_EXISTS, "标签 slug 已存在");
    }

    const affectedPostSlugs = await tagRepository.findPublishedPostSlugs(id);
    const row = await tagRepository.update(id, { name, slug }, input.version);
    return { tag: toAdminDTO(row), changeSet: { oldSlug: existing.slug, newSlug: slug, affectedPostSlugs } };
  },

  /** Deleting a tag removes only the post↔tag links (PRD B-12 / §7.5). */
  async deleteTag(id: string, version: number): Promise<{ changeSet: TagChangeSet; linkedPostCount: number }> {
    const existing = await tagRepository.findById(id);
    if (!existing) throw notFound(ErrorCodes.TAG_NOT_FOUND, "标签不存在");
    if (existing.version !== version) {
      throw conflict(ErrorCodes.TAG_CONCURRENT_MODIFICATION, "标签已被其他操作修改，请刷新后重试");
    }
    const affectedPostSlugs = await tagRepository.findPublishedPostSlugs(id);
    await tagRepository.delete(id, version);
    return {
      changeSet: { oldSlug: existing.slug, newSlug: existing.slug, affectedPostSlugs },
      linkedPostCount: existing._count.postTags,
    };
  },
};
