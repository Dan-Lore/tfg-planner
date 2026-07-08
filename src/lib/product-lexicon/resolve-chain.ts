import { stripFormatting } from './formatting';
import {
  collectLangKeysForResolve,
  fallbackName,
  isFallbackName,
  langKeysForResource,
  pickLang,
} from './lang-keys';
import {
  buildPrefixIndex,
  buildSuffixIndex,
  resolveNamespacedMaterial,
} from './material-prefix';
import { resolveTagCategoryMaterial, resolveTagCategoryOnly } from './tag-category';
import { resolveTagMemberFallback, resolveTagMemberBakedFallback } from './tag-member';
import { gtceuTierRepresentativeItem } from './gtceu-tier-tags';
import type { LangBundle, ResolveContext } from './types';

const MACHINE_ALIASES: Record<string, string[]> = {
  'minecraft:shaped': ['emi.category.minecraft.crafting'],
  'minecraft:shapeless': ['emi.category.minecraft.crafting'],
  'minecraft:smelting': ['emi.category.minecraft.smelting'],
};

function finalize(
  hit: { ru?: string; en?: string },
  fb: { ru: string; en: string },
): { ru: string; en: string } | null {
  if (!hit.ru && !hit.en) return null;
  return {
    ru: stripFormatting(hit.ru ?? hit.en ?? fb.ru),
    en: stripFormatting(hit.en ?? hit.ru ?? fb.en),
  };
}

function resolveResourceNameInner(
  id: string,
  bundle: LangBundle,
  ctx: ResolveContext,
): { ru: string; en: string } {
  const fb = fallbackName(id);

  const fast = ctx.resolved?.[id];
  if (fast && !isFallbackName(id, fast)) {
    return fast;
  }

  if (id.startsWith('#')) {
    const keys = langKeysForResource(id);
    const direct = finalize(pickLang(bundle, keys), fb);
    if (direct) return direct;

    const category = finalize(resolveTagCategoryMaterial(id, bundle), fb);
    if (category) return category;

    const categoryOnly = finalize(resolveTagCategoryOnly(id, bundle), fb);
    if (categoryOnly) return categoryOnly;

    const tierRep = gtceuTierRepresentativeItem(id);
    if (tierRep) {
      const tierHit = resolveResourceNameInner(tierRep, bundle, {
        ...ctx,
        skipTagMember: true,
      });
      if (!isFallbackName(tierRep, tierHit)) return tierHit;
    }

    if (!ctx.skipTagMember) {
      const member = finalize(
        resolveTagMemberFallback(id, bundle, ctx.tagIndex, resolveResourceNameInner, ctx),
        fb,
      );
      if (member) return member;

      const bakedMember = finalize(
        resolveTagMemberBakedFallback(id, ctx.tagIndex, ctx.bakedNames),
        fb,
      );
      if (bakedMember) return bakedMember;
    }

    const body = id.slice(1);
    if (body.includes(':')) {
      const itemFb = fallbackName(body);
      const itemHit = resolveResourceNameInner(body, bundle, {
        ...ctx,
        skipTagMember: true,
      });
      if (itemHit.ru !== itemFb.ru || itemHit.en !== itemFb.en) {
        return itemHit;
      }
    }

    return fb;
  }

  const suffixIndex =
    ctx.suffixIndex ??
    ({ ru: buildSuffixIndex(bundle.ru), en: buildSuffixIndex(bundle.en) } as const);
  const prefixIndex =
    ctx.prefixIndex ??
    ({ ru: buildPrefixIndex(bundle.ru), en: buildPrefixIndex(bundle.en) } as const);

  const materialHit = finalize(
    resolveNamespacedMaterial(id, bundle, suffixIndex, prefixIndex),
    fb,
  );
  if (materialHit) return materialHit;

  const keys = langKeysForResource(id);
  const direct = finalize(pickLang(bundle, keys), fb);
  if (direct) return direct;

  return fb;
}

export function resolveResourceName(
  id: string,
  bundle: LangBundle,
  options: ResolveContext = {},
): { ru: string; en: string } {
  return resolveResourceNameInner(id, bundle, options);
}

export function resolveMachineName(
  machineId: string,
  bundle: LangBundle,
): { ru: string; en: string } {
  const fb = fallbackName(machineId);
  const aliasKeys = MACHINE_ALIASES[machineId];
  if (aliasKeys) {
    const hit = pickLang(bundle, aliasKeys);
    const resolved = finalize(hit, fb);
    if (resolved) return resolved;
  }

  if (machineId.startsWith('gtceu:')) {
    const path = machineId.slice('gtceu:'.length);
    const hit = pickLang(bundle, [`gtceu.${path}`, `block.gtceu.${path}`]);
    const resolved = finalize(hit, fb);
    if (resolved) return resolved;
  }

  const [ns, path] = machineId.includes(':') ? machineId.split(':') : ['', machineId];
  const dot = path.replace(/\//g, '.');
  const hit = pickLang(bundle, [
    `block.${ns}.${dot}`,
    `item.${ns}.${dot}`,
    `container.${ns}.${dot}`,
  ]);
  const resolved = finalize(hit, fb);
  if (resolved) return resolved;

  return fb;
}

export function countNamedDefs(
  defs: readonly { id: string; names: { ru: string; en: string } }[],
): { resolved: number; total: number } {
  let resolved = 0;
  for (const d of defs) {
    if (!isFallbackName(d.id, d.names)) resolved++;
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
    if (!isFallbackName(id, name)) resolved++;
  }
  return { resolved, total: ids.length };
}

export function collectKeysForIds(ids: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of ids) {
    for (const key of collectLangKeysForResolve(id)) keys.add(key);
  }
  return keys;
}

export { collectLangKeysForResolve, fallbackName, isFallbackName };
