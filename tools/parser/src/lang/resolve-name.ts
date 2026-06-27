import { stripFormatting } from './formatting.js';
import type { LangBundle } from './types.js';

function fallbackName(id: string): { ru: string; en: string } {
  const base = id.startsWith('#') ? id.slice(1) : id.includes(':') ? id.split(':')[1]! : id;
  const label = base.replace(/[/_.]/g, ' ');
  return { ru: label, en: label };
}

function pickLang(
  bundle: LangBundle,
  keys: string[],
): { ru?: string; en?: string } {
  let ru: string | undefined;
  let en: string | undefined;
  for (const key of keys) {
    if (!ru && bundle.ru[key]) ru = bundle.ru[key];
    if (!en && bundle.en[key]) en = bundle.en[key];
    if (ru && en) break;
  }
  return { ru, en };
}

function langKeysForResource(id: string): string[] {
  if (id.startsWith('#')) {
    const body = id.slice(1);
    const colon = body.indexOf(':');
    const ns = colon >= 0 ? body.slice(0, colon) : body;
    const rest = colon >= 0 ? body.slice(colon + 1) : '';
    const dot = rest.replace(/\//g, '.');
    return [
      `tag.item.${ns}.${dot}`,
      `tag.fluid.${ns}.${dot}`,
      `tag.item.c.${dot}`,
      `tag.fluid.c.${dot}`,
      `tag.item.forge.${dot}`,
      `tag.fluid.forge.${dot}`,
      `tag.minecraft.${dot}`,
      `tag.${ns}.${dot}`,
    ];
  }

  if (!id.includes(':')) return [];
  const [ns, path] = id.split(':');
  const dot = path.replace(/\//g, '.');
  return [
    `item.${ns}.${dot}`,
    `fluid.${ns}.${dot}`,
    `block.${ns}.${dot}`,
  ];
}

interface SuffixEntry {
  suffix: string;
  prefix: string;
}

interface PrefixEntry {
  lead: string;
  tail: string;
  prefix: string;
}

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

  return [{ lead: `${leadWords.join('_')}_`, tail: `_${tailWord}` }];
}

function buildPrefixIndex(lang: Record<string, string>): PrefixEntry[] {
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

function buildSuffixIndex(lang: Record<string, string>): SuffixEntry[] {
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

function materialName(
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

function resolveMaterialPrefixItem(
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

const MACHINE_ALIASES: Record<string, string[]> = {
  'minecraft:shaped': ['emi.category.minecraft.crafting'],
  'minecraft:shapeless': ['emi.category.minecraft.crafting'],
  'minecraft:smelting': ['emi.category.minecraft.smelting'],
};

function resolveNamespacedMaterial(
  id: string,
  bundle: LangBundle,
): { ru?: string; en?: string } {
  const colon = id.indexOf(':');
  if (colon < 0) return {};
  const ns = id.slice(0, colon);
  const path = id.slice(colon + 1);

  if (ns !== 'gtceu' && ns !== 'tfg') return {};

  const ruSuffix = buildSuffixIndex(bundle.ru);
  const enSuffix = buildSuffixIndex(bundle.en);
  const ruPrefix = buildPrefixIndex(bundle.ru);
  const enPrefix = buildPrefixIndex(bundle.en);
  const ruResolved = resolveMaterialPrefixItem(ns, path, bundle.ru, ruSuffix, ruPrefix);
  const enResolved = resolveMaterialPrefixItem(ns, path, bundle.en, enSuffix, enPrefix);

  if (ruResolved || enResolved) {
    return { ru: ruResolved, en: enResolved };
  }

  if (ns === 'tfg') {
    const ruGt = resolveMaterialPrefixItem('gtceu', path, bundle.ru, ruSuffix, ruPrefix);
    const enGt = resolveMaterialPrefixItem('gtceu', path, bundle.en, enSuffix, enPrefix);
    if (ruGt || enGt) return { ru: ruGt, en: enGt };
  }

  return {};
}

export function resolveResourceName(id: string, bundle: LangBundle): { ru: string; en: string } {
  const fb = fallbackName(id);

  if (id.startsWith('#')) {
    const keys = langKeysForResource(id);
    const hit = pickLang(bundle, keys);
    if (hit.ru || hit.en) {
      return {
        ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
        en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
      };
    }

    const body = id.slice(1);
    if (body.includes(':')) {
      const itemFb = fallbackName(body);
      const itemHit = resolveResourceName(body, bundle);
      if (itemHit.ru !== itemFb.ru || itemHit.en !== itemFb.en) {
        return itemHit;
      }
    }

    return fb;
  }

  const materialHit = resolveNamespacedMaterial(id, bundle);
  if (materialHit.ru || materialHit.en) {
    return {
      ru: stripFormatting(materialHit.ru ?? materialHit.en ?? fb.ru),
      en: stripFormatting(materialHit.en ?? materialHit.ru ?? fb.en),
    };
  }

  const keys = langKeysForResource(id);
  const hit = pickLang(bundle, keys);
  if (hit.ru || hit.en) {
    return {
      ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
      en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
    };
  }

  return fb;
}

export function resolveMachineName(machineId: string, bundle: LangBundle): { ru: string; en: string } {
  const fb = fallbackName(machineId);
  const aliasKeys = MACHINE_ALIASES[machineId];
  if (aliasKeys) {
    const hit = pickLang(bundle, aliasKeys);
    if (hit.ru || hit.en) {
      return {
        ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
        en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
      };
    }
  }

  if (machineId.startsWith('gtceu:')) {
    const path = machineId.slice('gtceu:'.length);
    const hit = pickLang(bundle, [`gtceu.${path}`, `block.gtceu.${path}`]);
    if (hit.ru || hit.en) {
      return {
        ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
        en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
      };
    }
  }

  const [ns, path] = machineId.includes(':') ? machineId.split(':') : ['', machineId];
  const dot = path.replace(/\//g, '.');
  const hit = pickLang(bundle, [`block.${ns}.${dot}`, `item.${ns}.${dot}`, `container.${ns}.${dot}`]);
  if (hit.ru || hit.en) {
    return {
      ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
      en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
    };
  }

  return fb;
}

export function countNamedDefs(
  defs: readonly { id: string; names: { ru: string; en: string } }[],
): { resolved: number; total: number } {
  let resolved = 0;
  for (const d of defs) {
    const fb = fallbackName(d.id);
    if (d.names.ru !== fb.ru || d.names.en !== fb.en) resolved++;
  }
  return { resolved, total: defs.length };
}

export function countResolved(
  ids: string[],
  bundle: LangBundle,
  resolver: (id: string, bundle: LangBundle) => { ru: string; en: string },
): { resolved: number; total: number } {
  let resolved = 0;
  for (const id of ids) {
    const name = resolver(id, bundle);
    const fb = fallbackName(id);
    if (name.ru !== fb.ru || name.en !== fb.en) resolved++;
  }
  return { resolved, total: ids.length };
}
