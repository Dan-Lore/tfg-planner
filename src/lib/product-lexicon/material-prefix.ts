import type { LangBundle, PrefixEntry, SuffixEntry } from './types';

function isSuffixOnlyTagPrefix(prefix: string): boolean {
  if (prefix.startsWith('cable_gt_') || prefix.startsWith('wire_gt_') || prefix.startsWith('pipe_')) {
    return true;
  }
  return !prefix.includes('_') && !prefix.includes('.');
}

/** GTCEu ids like `tiny_rhenium_dust` use `{lead}{material}{tail}`, not `{material}{suffix}`. */
function prefixPatternsForTagPrefix(prefix: string): { lead: string; tail: string }[] {
  if (isSuffixOnlyTagPrefix(prefix)) return [];

  const segments = prefix.split('.');
  const lastSeg = segments[segments.length - 1]!;
  const lastUnderscore = lastSeg.lastIndexOf('_');
  if (lastUnderscore <= 0) return [];

  const tailWord = lastSeg.slice(lastUnderscore + 1);
  const leadWords =
    segments.length === 1
      ? [lastSeg.slice(0, lastUnderscore)]
      : [...segments.slice(0, -1), lastSeg.slice(0, lastUnderscore)];

  const patterns = [{ lead: `${leadWords.join('_')}_`, tail: `_${tailWord}` }];

  if (prefix === 'ore' || prefix === 'raw_ore') {
    patterns.push({ lead: 'poor_', tail: '_raw_ore' });
    patterns.push({ lead: 'rich_', tail: '_raw_ore' });
  }
  if (prefix === 'ingot' || prefix === 'dust') {
    patterns.push({ lead: 'molten_', tail: '' });
  }

  return patterns;
}

export function buildPrefixIndex(lang: Record<string, string>): PrefixEntry[] {
  const entries: PrefixEntry[] = [];
  for (const key of Object.keys(lang)) {
    if (!key.startsWith('tagprefix.')) continue;
    const prefix = key.slice('tagprefix.'.length);
    for (const { lead, tail } of prefixPatternsForTagPrefix(prefix)) {
      entries.push({ lead, tail, prefix });
    }
  }
  return entries.sort((a, b) => b.lead.length - a.lead.length);
}

function suffixesForTagPrefix(prefix: string): string[] {
  const cable = prefix.match(/^cable_gt_(.+)$/);
  if (cable) return [`_${cable[1]}_cable`];

  const wire = prefix.match(/^wire_gt_(.+)$/);
  if (wire) return [`_${wire[1]}_wire`];

  const pipe = prefix.match(/^pipe_(.+)$/);
  if (pipe) {
    const body = pipe[1];
    return [
      `_${body}_pipe`,
      `_${body}_fluid_pipe`,
      `_${body}_item_pipe`,
      `_${body}_restrictive_item_pipe`,
    ];
  }

  return [`_${prefix}`];
}

export function buildSuffixIndex(lang: Record<string, string>): SuffixEntry[] {
  const entries: SuffixEntry[] = [];
  for (const key of Object.keys(lang)) {
    if (!key.startsWith('tagprefix.')) continue;
    const prefix = key.slice('tagprefix.'.length);
    for (const suffix of suffixesForTagPrefix(prefix)) {
      entries.push({ suffix, prefix });
    }
  }
  return entries.sort((a, b) => b.suffix.length - a.suffix.length);
}

export function materialName(
  lang: Record<string, string>,
  ns: string,
  materialId: string,
): string | undefined {
  return (
    lang[`material.${ns}.${materialId}`] ??
    lang[`material.tfg.${materialId}`] ??
    lang[`material.gtceu.${materialId}`]
  );
}

export function resolveMaterialPrefixItem(
  ns: string,
  path: string,
  lang: Record<string, string>,
  suffixIndex: SuffixEntry[],
  prefixIndex: PrefixEntry[],
): string | undefined {
  const dot = path.replace(/\//g, '.');
  if (lang[`item.${ns}.${dot}`]) return lang[`item.${ns}.${dot}`];
  if (lang[`fluid.${ns}.${dot}`]) return lang[`fluid.${ns}.${dot}`];
  const directMat = materialName(lang, ns, path);
  if (directMat) return directMat;

  for (const { lead, tail, prefix } of prefixIndex) {
    if (!path.startsWith(lead) || !path.endsWith(tail)) continue;
    const materialId = path.slice(lead.length, path.length - tail.length);
    if (!materialId) continue;
    const matName = materialName(lang, ns, materialId);
    const fmtStr = lang[`tagprefix.${prefix}`];
    if (matName && fmtStr) return fmtStr.replace('%s', matName);
  }

  for (const { suffix, prefix } of suffixIndex) {
    if (!path.endsWith(suffix)) continue;
    const materialId = path.slice(0, -suffix.length);
    const matName = materialName(lang, ns, materialId);
    const fmtStr = lang[`tagprefix.${prefix}`];
    if (matName && fmtStr) return fmtStr.replace('%s', matName);
  }

  return undefined;
}

export function resolveNamespacedMaterial(
  id: string,
  bundle: LangBundle,
  suffixIndex: { ru: SuffixEntry[]; en: SuffixEntry[] },
  prefixIndex: { ru: PrefixEntry[]; en: PrefixEntry[] },
): { ru?: string; en?: string } {
  const colon = id.indexOf(':');
  if (colon < 0) return {};
  const ns = id.slice(0, colon);
  const path = id.slice(colon + 1);

  if (ns !== 'gtceu' && ns !== 'tfg' && ns !== 'greate') return {};

  const ruResolved = resolveMaterialPrefixItem(
    ns,
    path,
    bundle.ru,
    suffixIndex.ru,
    prefixIndex.ru,
  );
  const enResolved = resolveMaterialPrefixItem(
    ns,
    path,
    bundle.en,
    suffixIndex.en,
    prefixIndex.en,
  );

  if (ruResolved || enResolved) {
    return { ru: ruResolved, en: enResolved };
  }

  if (ns === 'tfg' || ns === 'greate') {
    const ruGt = resolveMaterialPrefixItem('gtceu', path, bundle.ru, suffixIndex.ru, prefixIndex.ru);
    const enGt = resolveMaterialPrefixItem('gtceu', path, bundle.en, suffixIndex.en, prefixIndex.en);
    if (ruGt || enGt) return { ru: ruGt, en: enGt };
  }

  return {};
}

export function collectMaterialPrefixKeys(bundle: LangBundle): string[] {
  const keys = new Set<string>();
  for (const lang of [bundle.ru, bundle.en]) {
    for (const key of Object.keys(lang)) {
      if (key.startsWith('tagprefix.') || key.startsWith('material.')) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}
