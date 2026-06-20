import { getItemName } from '@/data/pack-registry';
import type { PackData, Recipe } from '@/data/types';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { buildRecipePickerDetail, type RecipePickerDetail } from '@/lib/recipe-picker-detail';

export interface SearchComboboxItem {
  id: string;
  label: string;
  searchText: string;
  recipeDetail?: RecipePickerDetail;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/ё/g, 'е');
}

function tagSearchAliases(tagId: string, lang: 'ru' | 'en'): string[] {
  const aliases: Record<string, string[]> = {
    '#minecraft:logs_that_burn': [
      'бревна',
      'брёвна',
      'logs',
      'log',
      'wood',
      'дерево',
      'burnable logs',
      'горящие бревна',
    ],
    '#minecraft:logs': ['бревна', 'брёвна', 'logs', 'log', 'wood', 'дерево'],
    '#forge:dusts/copper': ['copper dust', 'медная пыль', 'медь'],
  };
  const list = aliases[tagId] ?? [];
  if (lang === 'en') return list;
  return list;
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
    if (!id) continue;
    names.add(getItemName(pack, id, lang));
    if (id.startsWith('#')) {
      for (const alias of tagSearchAliases(id, lang)) {
        names.add(alias);
      }
    }
  }
  const tail = recipe.id.includes(':') ? recipe.id.split(':').pop()! : recipe.id;
  names.add(tail);
  names.add(recipe.id);
  names.add(formatRecipeLabel(pack, recipe, lang));
  if (recipe.energy?.minVoltageTier) {
    names.add(recipe.energy.minVoltageTier);
  }
  return [...names].join(' ');
}

export function buildRecipeComboboxItems(
  pack: PackData,
  recipes: Recipe[],
  lang: 'ru' | 'en',
): SearchComboboxItem[] {
  return sortRecipesForPicker(pack, recipes, lang).map((r) => ({
    id: r.id,
    label: formatRecipeLabel(pack, r, lang),
    searchText: buildRecipeIngredientSearchText(pack, r, lang),
    recipeDetail: buildRecipePickerDetail(pack, r, lang),
  }));
}

export function sortRecipesForPicker(
  pack: PackData,
  recipes: Recipe[],
  lang: 'ru' | 'en',
): Recipe[] {
  return [...recipes].sort((a, b) =>
    formatRecipeLabel(pack, a, lang).localeCompare(
      formatRecipeLabel(pack, b, lang),
      lang,
    ),
  );
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

