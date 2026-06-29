import type { PackData, PackMeta } from '@/data/types';
import type { Recipe } from '@/data/types';

export interface TagIndex {
  /** tag id (#namespace:path) → member item/fluid ids */
  members: Map<string, Set<string>>;
  /** item/fluid id → tags it belongs to */
  tagsForItem: Map<string, Set<string>>;
}

const tagIndexCache = new WeakMap<object, TagIndex>();
const metaTagIndexCache = new WeakMap<object, TagIndex>();
const metaTagIndexCacheByKey = new Map<string, TagIndex>();

type MetaTagSource = Pick<PackMeta, 'items' | 'fluids' | 'modpackVersion' | 'dataVersion'>;

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
    for (const productId of productIds) {
      if (matchesTagRule(tagId, productId)) set.add(productId);
    }
    members.set(tagId, set);
    for (const itemId of set) {
      const list = tagsForItem.get(itemId) ?? new Set<string>();
      list.add(tagId);
      tagsForItem.set(itemId, list);
    }
  }

  return added ? { members, tagsForItem } : base;
}

function isBurnableLogId(id: string): boolean {
  if (id.startsWith('#')) return false;
  if (id.startsWith('tfc:wood/log/')) return true;
  if (id.startsWith('afc:wood/log/')) return true;
  if (/^minecraft:\w+_log$/.test(id)) return true;
  if (/^minecraft:stripped_\w+_log$/.test(id)) return true;
  if (id === 'tfc:stick_bundle') return true;
  return false;
}

function isLogId(id: string): boolean {
  if (id.startsWith('#')) return false;
  if (isBurnableLogId(id)) return true;
  if (id.includes('/log/')) return true;
  return false;
}

function productLocalId(id: string): string {
  const i = id.lastIndexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

function matchesTagRule(tagId: string, itemId: string): boolean {
  if (tagId === '#minecraft:logs_that_burn') return isBurnableLogId(itemId);
  if (tagId === '#minecraft:logs') return isLogId(itemId);

  const forgeDust = tagId.match(/^#forge:dusts\/(.+)$/);
  if (forgeDust) {
    const mat = forgeDust[1]!;
    return itemId.endsWith('_dust') && itemId.includes(mat);
  }

  const forgeSimple = tagId.match(/^#forge:([^/]+)$/);
  if (forgeSimple) {
    const mat = forgeSimple[1]!;
    return productLocalId(itemId) === mat;
  }

  const tfcLogs = tagId.match(/^#tfc:(.+)_logs$/);
  if (tfcLogs) {
    const wood = tfcLogs[1]!;
    return itemId.startsWith(`tfc:wood/log/${wood}`);
  }

  return false;
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


function buildTagIndexCore(
  tagIds: Set<string>,
  items: PackMeta['items'],
  fluids: PackMeta['fluids'],
): TagIndex {
  const members = new Map<string, Set<string>>();
  const tagsForItem = new Map<string, Set<string>>();
  const productIds = [
    ...items.map((i) => i.id),
    ...fluids.map((f) => f.id),
  ].filter((id) => !id.startsWith('#'));

  for (const tagId of tagIds) {
    const set = new Set<string>();
    for (const productId of productIds) {
      if (matchesTagRule(tagId, productId)) {
        set.add(productId);
      }
    }
    members.set(tagId, set);
  }

  for (const [tagId, set] of members) {
    for (const itemId of set) {
      const list = tagsForItem.get(itemId) ?? new Set<string>();
      list.add(tagId);
      tagsForItem.set(itemId, list);
    }
  }

  return { members, tagsForItem };
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
