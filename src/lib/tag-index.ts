import type { PackData, PackMeta } from '@/data/types';
import type { Recipe } from '@/data/types';
import { expandTagAliases, inferTagsForProduct, productMatchesTag } from '@/lib/tag-rules';

export interface TagIndex {
  /** tag id (#namespace:path) → member item/fluid ids */
  members: Map<string, Set<string>>;
  /** item/fluid id → tags it belongs to */
  tagsForItem: Map<string, Set<string>>;
}

const tagIndexCache = new WeakMap<object, TagIndex>();
const metaTagIndexCache = new WeakMap<object, TagIndex>();
const metaTagIndexCacheByKey = new Map<string, TagIndex>();

type MetaTagSource = Pick<PackMeta, 'items' | 'fluids'> &
  Partial<Pick<PackMeta, 'modpackVersion' | 'dataVersion'>>;

function metaTagCacheKey(meta: MetaTagSource): string | null {
  if (!meta.modpackVersion || meta.dataVersion == null) return null;
  return `${meta.modpackVersion}\0${meta.dataVersion}\0${meta.items.length}\0${meta.fluids.length}`;
}

function getOrBuildMetaTagIndex(meta: MetaTagSource): TagIndex {
  const byRef = metaTagIndexCache.get(meta.items);
  if (byRef) return byRef;

  const stableKey = metaTagCacheKey(meta);
  if (stableKey) {
    const byKey = metaTagIndexCacheByKey.get(stableKey);
    if (byKey) {
      metaTagIndexCache.set(meta.items, byKey);
      return byKey;
    }
  }

  const index = buildTagIndexCore(collectTagIdsFromMeta(meta), meta.items, meta.fluids);
  metaTagIndexCache.set(meta.items, index);
  if (stableKey) metaTagIndexCacheByKey.set(stableKey, index);
  return index;
}

function collectTagIdsFromMeta(meta: Pick<PackMeta, 'items' | 'fluids'>): Set<string> {
  const tags = new Set<string>();
  for (const def of [...meta.items, ...meta.fluids]) {
    if (def.id.startsWith('#')) tags.add(def.id);
  }
  return tags;
}

function collectTagIdsFromRecipes(recipes: readonly Recipe[]): Set<string> {
  const tags = new Set<string>();
  for (const recipe of recipes) {
    for (const flow of [...recipe.inputs, ...recipe.outputs]) {
      const id = flow.itemId ?? flow.fluidId;
      if (id?.startsWith('#')) tags.add(id);
    }
  }
  return tags;
}

function addMember(
  members: Map<string, Set<string>>,
  tagsForItem: Map<string, Set<string>>,
  tagId: string,
  productId: string,
): void {
  let set = members.get(tagId);
  if (!set) {
    set = new Set<string>();
    members.set(tagId, set);
  }
  set.add(productId);
  const tagList = tagsForItem.get(productId) ?? new Set<string>();
  tagList.add(tagId);
  tagsForItem.set(productId, tagList);
}

function buildTagIndexCore(
  tagIds: Set<string>,
  items: PackMeta['items'],
  fluids: PackMeta['fluids'],
): TagIndex {
  const members = new Map<string, Set<string>>();
  const tagsForItem = new Map<string, Set<string>>();

  for (const tagId of tagIds) {
    members.set(tagId, new Set());
  }

  const productIds = [
    ...items.map((i) => i.id),
    ...fluids.map((f) => f.id),
  ].filter((id) => !id.startsWith('#'));

  for (const productId of productIds) {
    const inferred = inferTagsForProduct(productId);
    for (const candidate of inferred) {
      for (const tagId of expandTagAliases(candidate)) {
        if (tagIds.has(tagId)) addMember(members, tagsForItem, tagId, productId);
      }
    }
  }

  return { members, tagsForItem };
}

function mergeExtraTagsIntoIndex(
  base: TagIndex,
  extraTagIds: Iterable<string>,
  items: PackMeta['items'],
  fluids: PackMeta['fluids'],
): TagIndex {
  const productIds = [
    ...items.map((i) => i.id),
    ...fluids.map((f) => f.id),
  ].filter((id) => !id.startsWith('#'));

  const members = new Map(base.members);
  const tagsForItem = new Map<string, Set<string>>();
  for (const [itemId, tagSet] of base.tagsForItem) {
    tagsForItem.set(itemId, new Set(tagSet));
  }

  let added = false;
  for (const tagId of extraTagIds) {
    if (members.has(tagId)) continue;
    added = true;
    const set = new Set<string>();
    members.set(tagId, set);
    for (const productId of productIds) {
      if (productMatchesTag(tagId, productId)) {
        set.add(productId);
        const list = tagsForItem.get(productId) ?? new Set<string>();
        list.add(tagId);
        tagsForItem.set(productId, list);
      }
    }
  }

  return added ? { members, tagsForItem } : base;
}

/** Tag index from meta only (no recipe I/O). Recipe tag refs merged via buildTagIndexForRecipes. */
export function buildTagIndexFromMeta(meta: Pick<PackMeta, 'items' | 'fluids'>): TagIndex {
  return getOrBuildMetaTagIndex(meta);
}

export function buildTagIndexForRecipes(
  meta: Pick<PackMeta, 'items' | 'fluids'>,
  recipes: readonly Recipe[],
  base?: TagIndex,
): TagIndex {
  const metaTagIds = collectTagIdsFromMeta(meta);
  const recipeTagIds = collectTagIdsFromRecipes(recipes);
  if (recipes.length === 0 && base) return base;

  const metaIndex = base ?? getOrBuildMetaTagIndex(meta);
  const extraTags: string[] = [];
  for (const id of recipeTagIds) {
    if (!metaTagIds.has(id)) extraTags.push(id);
  }
  if (extraTags.length === 0) return metaIndex;
  return mergeExtraTagsIntoIndex(metaIndex, extraTags, meta.items, meta.fluids);
}

export function buildTagIndex(pack: PackData): TagIndex {
  const cached = tagIndexCache.get(pack);
  if (cached) return cached;
  const metaIndex = getOrBuildMetaTagIndex(pack);
  const metaTagIds = collectTagIdsFromMeta(pack);
  const recipeTagIds = collectTagIdsFromRecipes(pack.recipes);
  const extraTags: string[] = [];
  for (const id of recipeTagIds) {
    if (!metaTagIds.has(id)) extraTags.push(id);
  }
  const index =
    extraTags.length === 0
      ? metaIndex
      : mergeExtraTagsIntoIndex(metaIndex, extraTags, pack.items, pack.fluids);
  tagIndexCache.set(pack, index);
  return index;
}
