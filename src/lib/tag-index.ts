import type { PackData } from '@/data/types';

export interface TagIndex {
  /** tag id (#namespace:path) → member item/fluid ids */
  members: Map<string, Set<string>>;
  /** item/fluid id → tags it belongs to */
  tagsForItem: Map<string, Set<string>>;
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

function collectTagIds(pack: PackData): Set<string> {
  const tags = new Set<string>();
  for (const item of pack.items) {
    if (item.id.startsWith('#')) tags.add(item.id);
  }
  for (const recipe of pack.recipes) {
    for (const flow of [...recipe.inputs, ...recipe.outputs]) {
      const id = flow.itemId ?? flow.fluidId;
      if (id?.startsWith('#')) tags.add(id);
    }
  }
  return tags;
}

export function buildTagIndex(pack: PackData): TagIndex {
  const members = new Map<string, Set<string>>();
  const tagsForItem = new Map<string, Set<string>>();
  const tagIds = collectTagIds(pack);
  const productIds = [
    ...pack.items.map((i) => i.id),
    ...pack.fluids.map((f) => f.id),
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
