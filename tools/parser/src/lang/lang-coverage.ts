import { isFallbackName } from '../../../../src/shared/product-lexicon/index.js';
import type { LocalizedName } from '../../../../src/data/types.js';

export interface RecipeIoLocalizedStats {
  recipeIoLocalized: number;
  recipeIoTotal: number;
  recipeIoTagsLocalized: number;
  recipeIoTagsTotal: number;
  recipeIoItemsLocalized: number;
  recipeIoItemsTotal: number;
  recipeIoFluidsLocalized: number;
  recipeIoFluidsTotal: number;
}

export function computeRecipeIoLocalized(
  productIds: Iterable<string>,
  resolved: Record<string, LocalizedName>,
): RecipeIoLocalizedStats {
  let recipeIoTotal = 0;
  let recipeIoLocalized = 0;
  let recipeIoTagsTotal = 0;
  let recipeIoTagsLocalized = 0;
  let recipeIoItemsTotal = 0;
  let recipeIoItemsLocalized = 0;
  let recipeIoFluidsTotal = 0;
  let recipeIoFluidsLocalized = 0;

  for (const id of productIds) {
    recipeIoTotal++;
    const names = resolved[id];
    const ok = names ? !isFallbackName(id, names) : false;
    if (ok) recipeIoLocalized++;

    if (id.startsWith('#')) {
      recipeIoTagsTotal++;
      if (ok) recipeIoTagsLocalized++;
    } else if (id.includes(':') && !id.startsWith('#')) {
      const isFluid = !id.includes('_ore') && resolved[id] && (
        id.includes('acid') || id.includes('fluid') || id.startsWith('gtceu:') && !id.endsWith('_dust')
      );
      // Simpler: count non-tag ids with fluidId pattern from caller buckets
      recipeIoItemsTotal++;
      if (ok) recipeIoItemsLocalized++;
      void isFluid;
    }
  }

  return {
    recipeIoLocalized: recipeIoTotal > 0 ? recipeIoLocalized / recipeIoTotal : 1,
    recipeIoTotal,
    recipeIoTagsLocalized: recipeIoTagsTotal > 0 ? recipeIoTagsLocalized / recipeIoTagsTotal : 1,
    recipeIoTagsTotal,
    recipeIoItemsLocalized: recipeIoItemsTotal > 0 ? recipeIoItemsLocalized / recipeIoItemsTotal : 1,
    recipeIoItemsTotal,
    recipeIoFluidsLocalized: recipeIoFluidsTotal > 0 ? recipeIoFluidsLocalized / recipeIoFluidsTotal : 1,
    recipeIoFluidsTotal,
  };
}

export function computeRecipeIoLocalizedByKind(
  items: Iterable<string>,
  fluids: Iterable<string>,
  tags: Iterable<string>,
  resolved: Record<string, LocalizedName>,
): RecipeIoLocalizedStats {
  const count = (ids: Iterable<string>) => {
    let total = 0;
    let localized = 0;
    for (const id of ids) {
      total++;
      const names = resolved[id];
      if (names && !isFallbackName(id, names)) localized++;
    }
    return { total, localized, ratio: total > 0 ? localized / total : 1 };
  };

  const itemStats = count(items);
  const fluidStats = count(fluids);
  const tagStats = count(tags);

  const recipeIoTotal = itemStats.total + fluidStats.total + tagStats.total;
  const recipeIoLocalizedCount =
    itemStats.localized + fluidStats.localized + tagStats.localized;

  return {
    recipeIoLocalized: recipeIoTotal > 0 ? recipeIoLocalizedCount / recipeIoTotal : 1,
    recipeIoTotal,
    recipeIoTagsLocalized: tagStats.ratio,
    recipeIoTagsTotal: tagStats.total,
    recipeIoItemsLocalized: itemStats.ratio,
    recipeIoItemsTotal: itemStats.total,
    recipeIoFluidsLocalized: fluidStats.ratio,
    recipeIoFluidsTotal: fluidStats.total,
  };
}
