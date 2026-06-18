import { getItemName } from '@/data/pack-registry';
import type { PackData, Recipe } from '@/data/types';

export interface SearchComboboxItem {
  id: string;
  label: string;
  searchText: string;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function filterItemsByQuery(
  items: SearchComboboxItem[],
  query: string,
): SearchComboboxItem[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return items;
  return items.filter((item) =>
    normalizeSearchQuery(item.searchText).includes(normalized),
  );
}

export function splitMachineDisplay(
  query: string,
  firstLabel: string | undefined,
): { typed: string; suffix: string } {
  if (!firstLabel) return { typed: query, suffix: '' };
  if (!query) return { typed: '', suffix: firstLabel };
  const prefix = firstLabel.slice(0, query.length);
  if (prefix.toLocaleLowerCase() === query.toLocaleLowerCase()) {
    return { typed: query, suffix: firstLabel.slice(query.length) };
  }
  return { typed: query, suffix: '' };
}

export function getPrefixAutocompleteSuffix(
  query: string,
  firstLabel: string | undefined,
): string {
  return splitMachineDisplay(query, firstLabel).suffix;
}

export function buildRecipeIngredientSearchText(
  pack: PackData,
  recipe: Recipe,
  lang: 'ru' | 'en',
): string {
  const names = new Set<string>();
  for (const flow of [...recipe.inputs, ...recipe.outputs]) {
    const id = flow.itemId ?? flow.fluidId;
    if (id) names.add(getItemName(pack, id, lang));
  }
  if (names.size === 0) {
    const tail = recipe.id.includes(':') ? recipe.id.split(':').pop()! : recipe.id;
    return tail;
  }
  return [...names].join(' ');
}

export function resolveMachineId(
  explicitId: string | null,
  filtered: SearchComboboxItem[],
): string | null {
  if (explicitId && filtered.some((item) => item.id === explicitId)) {
    return explicitId;
  }
  return filtered[0]?.id ?? null;
}
export function resolveMachineDisplayLabel(
  items: SearchComboboxItem[],
  filtered: SearchComboboxItem[],
  query: string,
  explicitId: string | null,
): string | undefined {
  if (!normalizeSearchQuery(query) && explicitId) {
    return items.find((item) => item.id === explicitId)?.label ?? filtered[0]?.label;
  }
  return filtered[0]?.label;
}
export function findActiveItemIndex(
  filtered: SearchComboboxItem[],
  explicitId: string | null,
  value: string,
): number {
  if (filtered.length === 0) return -1;
  const activeId = explicitId || value;
  if (!activeId) return 0;
  const idx = filtered.findIndex((item) => item.id === activeId);
  return idx >= 0 ? idx : 0;
}

