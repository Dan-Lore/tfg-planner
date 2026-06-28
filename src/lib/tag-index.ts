import type { PackData, PackMeta } from '@/data/types';
import type { Recipe } from '@/data/types';

export interface TagIndex {
  /** tag id (#namespace:path) → member item/fluid ids */
  members: Map<string, Set<string>>;
  /** item/fluid id → tags it belongs to */
  tagsForItem: Map<string, Set<string>>;
}

const tagIndexCache = new WeakMap<object, TagIndex>();

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

function matchesTagRule(tagId: string, itemId: string): boolean {
  if (tagId === '#minecraft:logs_that_burn') return isBurnableLogId(itemId);
  if (tagId === '#minecraft:logs') return isLogId(itemId);

  const forgeDust = tagId.match(/^#forge:dusts\/(.+)$/);
  if (forgeDust) {
    const mat = forgeDust[1]!;
    return itemId.endsWith('_dust') && itemId.includes(mat);
  }

  const tfcLogs = tagId.match(/^#tfc:(.+)_logs$/);
  if (tfcLogs) {
    const wood = tfcLogs[1]!;
    return itemId.startsWith(`tfc:wood/log/${wood}`);
  }

  return false;
}

function collectTagIdsFromMeta(meta: Pick<PackMeta, 'items'>): Set<string> {
  const tags = new Set<string>();
  for (const item of meta.items) {
    if (item.id.startsWith('#')) tags.add(item.id);
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

function collectTagIds(pack: PackData): Set<string> {
  const tags = collectTagIdsFromMeta(pack);
  for (const recipe of pack.recipes) {
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
  return buildTagIndexCore(collectTagIdsFromMeta(meta), meta.items, meta.fluids);
}

export function buildTagIndexForRecipes(
  meta: Pick<PackMeta, 'items' | 'fluids'>,
  recipes: readonly Recipe[],
  base?: TagIndex,
): TagIndex {
  const tagIds = collectTagIdsFromMeta(meta);
  for (const id of collectTagIdsFromRecipes(recipes)) tagIds.add(id);
  if (base && recipes.length === 0) return base;
  return buildTagIndexCore(tagIds, meta.items, meta.fluids);
}

export function buildTagIndex(pack: PackData): TagIndex {
  const cached = tagIndexCache.get(pack);
  if (cached) return cached;
  const index = buildTagIndexCore(collectTagIds(pack), pack.items, pack.fluids);
  tagIndexCache.set(pack, index);
  return index;
}
