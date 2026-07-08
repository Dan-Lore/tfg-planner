import type { LangBundle } from './types';
import { materialName } from './material-prefix';

function categoryVariants(category: string): string[] {
  const variants = new Set<string>([category]);
  if (category.endsWith('ies') && category.length > 3) {
    variants.add(`${category.slice(0, -3)}y`);
  } else if (category.endsWith('s') && category.length > 1) {
    variants.add(category.slice(0, -1));
  } else {
    variants.add(`${category}s`);
  }
  if (category === 'small_gears') variants.add('small_gear');
  if (category === 'small_gear') variants.add('small_gears');
  if (category === 'sheets') variants.add('sheet');
  if (category === 'sheet') variants.add('sheets');
  return [...variants];
}

function categoryLangKeys(ns: string, category: string): string[] {
  const keys: string[] = [];
  for (const cat of categoryVariants(category)) {
    for (const kind of ['item', 'fluid'] as const) {
      keys.push(`tag.${kind}.${ns}.${cat}`);
      keys.push(`tag.${kind}.forge.${cat}`);
      keys.push(`tag.${kind}.c.${cat}`);
    }
  }
  return keys;
}

function materialLangKeys(ns: string, material: string): string[] {
  const keys = [
    `material.${ns}.${material}`,
    `material.tfg.${material}`,
    `material.gtceu.${material}`,
    `item.${ns}.${material}`,
    `fluid.${ns}.${material}`,
    `block.${ns}.${material}`,
  ];
  if (ns === 'forge') {
    keys.push(`item.gtceu.${material}`, `fluid.gtceu.${material}`);
  }
  return keys;
}

function composeCategoryMaterial(
  categoryFmt: string | undefined,
  materialLabel: string | undefined,
): string | undefined {
  if (!categoryFmt || !materialLabel) return undefined;
  if (categoryFmt.includes('%s')) return categoryFmt.replace('%s', materialLabel);
  return `${categoryFmt} ${materialLabel}`;
}

/** Tags with category only (no material), e.g. `#forge:screws`. */
export function resolveTagCategoryOnly(
  tagId: string,
  bundle: LangBundle,
): { ru?: string; en?: string } {
  if (!tagId.startsWith('#')) return {};
  const body = tagId.slice(1);
  const colon = body.indexOf(':');
  if (colon < 0) return {};
  const ns = body.slice(0, colon);
  const path = body.slice(colon + 1);
  if (!path || path.includes('/')) return {};

  const keys: string[] = [];
  for (const kind of ['item', 'fluid'] as const) {
    keys.push(`tag.${kind}.${ns}.${path}`);
    keys.push(`tag.${kind}.forge.${path}`);
    keys.push(`tag.${kind}.c.${path}`);
  }

  let ru: string | undefined;
  let en: string | undefined;
  for (const key of keys) {
    if (!ru && bundle.ru[key]) ru = bundle.ru[key];
    if (!en && bundle.en[key]) en = bundle.en[key];
    if (ru && en) break;
  }
  if (ru || en) return { ru, en };
  return {};
}

/** `#forge:dusts/copper` → category tag key + material name. */
export function resolveTagCategoryMaterial(
  tagId: string,
  bundle: LangBundle,
): { ru?: string; en?: string } {
  if (!tagId.startsWith('#')) return {};
  const body = tagId.slice(1);
  const colon = body.indexOf(':');
  if (colon < 0) return {};
  const ns = body.slice(0, colon);
  const rest = body.slice(colon + 1);
  const slash = rest.indexOf('/');
  if (slash < 0) return {};

  const category = rest.slice(0, slash);
  const material = rest.slice(slash + 1);
  if (!category || !material) return {};

  const catKeys = categoryLangKeys(ns, category);
  let ruCat: string | undefined;
  let enCat: string | undefined;
  for (const key of catKeys) {
    if (!ruCat && bundle.ru[key]) ruCat = bundle.ru[key];
    if (!enCat && bundle.en[key]) enCat = bundle.en[key];
    if (ruCat && enCat) break;
  }

  const matKeys = materialLangKeys(ns, material);
  let ruMat: string | undefined;
  let enMat: string | undefined;
  for (const key of matKeys) {
    if (!ruMat) ruMat = bundle.ru[key] ?? materialName(bundle.ru, ns, material);
    if (!enMat) enMat = bundle.en[key] ?? materialName(bundle.en, ns, material);
    if (ruMat && enMat) break;
  }

  const ru = composeCategoryMaterial(ruCat, ruMat);
  const en = composeCategoryMaterial(enCat, enMat);
  if (ru || en) return { ru, en };
  return {};
}
