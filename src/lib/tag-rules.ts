/**
 * Tag inference: product id → tag ids used in recipe I/O.
 * Recipes often reference `#forge:…` / `#mod:…` tags while edges carry concrete ids.
 */

export function productLocalId(id: string): string {
  const i = id.lastIndexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

export function productNamespace(id: string): string | null {
  const i = id.indexOf(':');
  return i >= 0 ? id.slice(0, i) : null;
}

type AffixPattern = { prefix?: string; suffix: string };

/** GTCEu-style local id suffixes for `#forge:{category}/{material}`. */
const FORGE_CATEGORY_AFFIXES: Record<string, AffixPattern[]> = {
  dusts: [{ suffix: '_dust' }],
  tiny_dusts: [{ prefix: 'tiny_', suffix: '_dust' }],
  small_dusts: [{ prefix: 'small_', suffix: '_dust' }],
  impure_dusts: [{ prefix: 'impure_', suffix: '_dust' }],
  pure_dusts: [{ prefix: 'pure_', suffix: '_dust' }],
  purified_ores: [{ suffix: '_purified_ore' }],
  crushed_ores: [{ suffix: '_crushed_ore' }],
  refined_ores: [{ suffix: '_refined_ore' }],
  raw_materials: [{ suffix: '_raw_ore' }, { suffix: '_raw_material' }],
  ingots: [{ suffix: '_ingot' }],
  hot_ingots: [{ prefix: 'hot_', suffix: '_ingot' }],
  double_ingots: [{ suffix: '_double_ingot' }],
  plates: [{ suffix: '_plate' }],
  double_plates: [{ suffix: '_double_plate' }],
  nuggets: [{ suffix: '_nugget' }],
  rods: [{ suffix: '_rod' }],
  long_rods: [{ suffix: '_long_rod' }],
  gems: [{ suffix: '_gem' }],
  flawed_gems: [{ prefix: 'flawed_', suffix: '_gem' }],
  chipped_gems: [{ prefix: 'chipped_', suffix: '_gem' }],
  exquisite_gems: [{ prefix: 'exquisite_', suffix: '_gem' }],
  storage_blocks: [{ suffix: '_block' }],
  foils: [{ suffix: '_foil' }],
  screws: [{ suffix: '_screw' }],
  bolts: [{ suffix: '_bolt' }],
  gears: [{ suffix: '_gear' }],
  rings: [{ suffix: '_ring' }],
  rotors: [{ suffix: '_rotor' }],
  lenses: [{ suffix: '_lens' }],
  springs: [{ suffix: '_spring' }],
  small_springs: [{ prefix: 'small_', suffix: '_spring' }],
  single_wires: [{ suffix: '_single_wire' }],
  double_wires: [{ suffix: '_double_wire' }],
  quadruple_wires: [{ suffix: '_quadruple_wire' }],
  octal_wires: [{ suffix: '_octal_wire' }],
  hex_wires: [{ suffix: '_hex_wire' }],
  fine_wires: [{ suffix: '_fine_wire' }],
  tool_heads: [
    { suffix: '_hammer_head' },
    { suffix: '_wrench_head' },
    { suffix: '_saw_head' },
    { suffix: '_buzz_saw_blade' },
  ],
};

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

function materialFromAffix(local: string, { prefix, suffix }: AffixPattern): string | null {
  if (prefix) {
    if (!local.startsWith(prefix) || !local.endsWith(suffix)) return null;
    const mat = local.slice(prefix.length, local.length - suffix.length);
    return mat.length > 0 ? mat : null;
  }
  if (!local.endsWith(suffix)) return null;
  const mat = local.slice(0, -suffix.length);
  return mat.length > 0 ? mat : null;
}

/** `axe_head` → `axe_heads`, `belt_connector` → `belt_connectors`. */
function pluralizeCategorySuffix(suffix: string): string {
  const parts = suffix.split('_');
  const last = parts[parts.length - 1]!;
  if (!last.endsWith('s')) parts[parts.length - 1] = `${last}s`;
  return parts.join('_');
}

/** `{material}_{compound}` → `#forge:{compound}s/{material}` for unlisted GT categories. */
function inferForgeCompoundCategoryTags(local: string): string[] {
  const tags: string[] = [];
  const parts = local.split('_');
  for (let splitAt = 1; splitAt < parts.length; splitAt++) {
    const material = parts.slice(0, splitAt).join('_');
    const suffix = parts.slice(splitAt).join('_');
    if (!material || !suffix) continue;
    tags.push(`#forge:${pluralizeCategorySuffix(suffix)}/${material}`);
  }
  return tags;
}

function inferForgeTagsFromLocal(local: string): string[] {
  const tags = new Set<string>([`#forge:${local}`, ...inferForgeCompoundCategoryTags(local)]);

  for (const [category, affixes] of Object.entries(FORGE_CATEGORY_AFFIXES)) {
    for (const affix of affixes) {
      const material = materialFromAffix(local, affix);
      if (material) tags.add(`#forge:${category}/${material}`);
    }
  }

  return [...tags];
}

function pathVariants(path: string): string[] {
  const variants = new Set<string>([path, path.replace(/\//g, '_'), path.replace(/_/g, '/')]);
  if (path.endsWith('s') && path.length > 1) {
    variants.add(path.slice(0, -1));
    if (path.endsWith('ies')) variants.add(`${path.slice(0, -3)}y`);
  } else {
    variants.add(`${path}s`);
    if (path.endsWith('y')) variants.add(`${path.slice(0, -1)}ies`);
  }
  return [...variants];
}

function inferNamespaceTags(ns: string, local: string): string[] {
  const tags = new Set<string>();
  for (const path of pathVariants(local)) {
    tags.add(`#${ns}:${path}`);
  }
  return [...tags];
}

function parseTagId(tagId: string): { ns: string; path: string } | null {
  if (!tagId.startsWith('#')) return null;
  const body = tagId.slice(1);
  const colon = body.indexOf(':');
  if (colon < 0) return null;
  return { ns: body.slice(0, colon), path: body.slice(colon + 1) };
}

function categoryToProductSuffix(category: string): string {
  const parts = category.split('_');
  const last = parts[parts.length - 1]!;
  const singularLast = last.endsWith('s') && last.length > 1 ? last.slice(0, -1) : last;
  parts[parts.length - 1] = singularLast;
  return `_${parts.join('_')}`;
}

function structuralTagMatch(tagId: string, productId: string): boolean {
  const tag = parseTagId(tagId);
  if (!tag) return false;

  const prodNs = productNamespace(productId);
  const prodLocal = productLocalId(productId);
  if (!prodNs) return false;

  const tagPaths = pathVariants(tag.path);

  if (tag.path.includes('/')) {
    const slash = tag.path.lastIndexOf('/');
    const category = tag.path.slice(0, slash);
    const material = tag.path.slice(slash + 1);
    if (category && material) {
      const expected = `${material}${categoryToProductSuffix(category)}`;
      if (prodLocal === expected) return true;
    }
  }

  if (tag.ns === prodNs || tag.ns === 'forge' || tag.ns === 'c') {
    for (const path of tagPaths) {
      if (prodLocal === path) return true;
      if (prodLocal.endsWith(`_${path}`)) return true;
      if (path.includes('/') && prodLocal === path.replace(/\//g, '_')) return true;
    }
  }

  if (tag.ns === 'minecraft' && tag.path === 'logs_that_burn' && isBurnableLogId(productId)) {
    return true;
  }
  if (tag.ns === 'minecraft' && tag.path === 'logs' && isLogId(productId)) {
    return true;
  }

  const tfcWood = productId.match(/^tfc:wood\/log\/(.+)$/);
  if (tfcWood && tag.ns === 'tfc' && tag.path === `${tfcWood[1]}_logs`) return true;

  const afcWood = productId.match(/^afc:wood\/log\/(.+)$/);
  if (afcWood && tag.ns === 'afc' && tag.path === `${afcWood[1]}_logs`) return true;

  return false;
}

/** `#c:` tags mirror `#forge:` in NeoForge packs. */
export function expandTagAliases(tagId: string): string[] {
  const out = new Set<string>([tagId]);
  if (tagId.startsWith('#c:')) out.add(`#forge:${tagId.slice(3)}`);
  if (tagId.startsWith('#forge:')) out.add(`#c:${tagId.slice(7)}`);
  return [...out];
}

function addTagAliases(tags: Set<string>, tagId: string): void {
  tags.add(tagId);
  for (const alias of expandTagAliases(tagId)) tags.add(alias);
}

/** All tag ids a concrete product may satisfy (before intersecting with pack tag set). */
export function inferTagsForProduct(productId: string): string[] {
  if (productId.startsWith('#')) return [];

  const tags = new Set<string>();
  const local = productLocalId(productId);
  const ns = productNamespace(productId);

  for (const forgeTag of inferForgeTagsFromLocal(local)) {
    addTagAliases(tags, forgeTag);
  }

  if (ns) {
    for (const modTag of inferNamespaceTags(ns, local)) {
      tags.add(modTag);
    }
  }

  if (isBurnableLogId(productId)) tags.add('#minecraft:logs_that_burn');
  if (isLogId(productId)) tags.add('#minecraft:logs');

  const tfcWood = productId.match(/^tfc:wood\/log\/(.+)$/);
  if (tfcWood) tags.add(`#tfc:${tfcWood[1]}_logs`);

  const afcWood = productId.match(/^afc:wood\/log\/(.+)$/);
  if (afcWood) tags.add(`#afc:${afcWood[1]}_logs`);

  return [...tags];
}

export function productMatchesTag(tagId: string, productId: string): boolean {
  if (!tagId.startsWith('#') || productId.startsWith('#')) return false;
  if (tagId === productId) return true;

  const inferred = inferTagsForProduct(productId);
  for (const alias of expandTagAliases(tagId)) {
    if (inferred.includes(alias)) return true;
  }

  for (const alias of expandTagAliases(tagId)) {
    if (structuralTagMatch(alias, productId)) return true;
  }
  return false;
}
