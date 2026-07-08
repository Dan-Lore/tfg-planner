import type { TagIndex } from '@/lib/tag-index';
import {
  buildPrefixIndex,
  buildSuffixIndex,
  collectMaterialPrefixKeys,
} from './material-prefix';
import { isFallbackName, collectKeysForIds, resolveResourceName } from './resolve-chain';
import { collectLangKeysForResolve } from './lang-keys';
import { gtceuTierRepresentativeItem } from './gtceu-tier-tags';
import type { AppLang, LangBundle, PackLangArtifact, PrefixEntry, ResolveContext, SuffixEntry } from './types';

export class ProductLexicon {
  private readonly suffixIndex: { ru: SuffixEntry[]; en: SuffixEntry[] };
  private readonly prefixIndex: { ru: PrefixEntry[]; en: PrefixEntry[] };

  constructor(
    readonly bundle: LangBundle,
    readonly resolved?: Record<string, import('@/data/types').LocalizedName>,
  ) {
    this.suffixIndex = {
      ru: buildSuffixIndex(bundle.ru),
      en: buildSuffixIndex(bundle.en),
    };
    this.prefixIndex = {
      ru: buildPrefixIndex(bundle.ru),
      en: buildPrefixIndex(bundle.en),
    };
  }

  static fromArtifact(artifact: PackLangArtifact): ProductLexicon {
    return new ProductLexicon(artifact.bundle, artifact.resolved);
  }

  get isReady(): boolean {
    return true;
  }

  resolve(
    id: string,
    lang: AppLang,
    options: Omit<ResolveContext, 'resolved' | 'suffixIndex' | 'prefixIndex'> = {},
  ): string {
    const names = resolveResourceName(id, this.bundle, {
      ...options,
      resolved: this.resolved,
      suffixIndex: this.suffixIndex,
      prefixIndex: this.prefixIndex,
    });
    return names[lang] ?? names.en;
  }

  resolvePair(
    id: string,
    options: Omit<ResolveContext, 'resolved' | 'suffixIndex' | 'prefixIndex'> = {},
  ): { ru: string; en: string } {
    return resolveResourceName(id, this.bundle, {
      ...options,
      resolved: this.resolved,
      suffixIndex: this.suffixIndex,
      prefixIndex: this.prefixIndex,
    });
  }
}

export function pruneLangBundle(
  full: LangBundle,
  productIds: Iterable<string>,
  extraKeys?: Iterable<string>,
): LangBundle {
  const keys = collectKeysForIds(productIds);
  for (const key of extraKeys ?? []) keys.add(key);
  for (const key of collectMaterialPrefixKeys(full)) keys.add(key);

  const ru: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const key of keys) {
    if (full.ru[key]) ru[key] = full.ru[key];
    if (full.en[key]) en[key] = full.en[key];
  }
  return { ru, en };
}

export function buildResolvedMap(
  productIds: Iterable<string>,
  bundle: LangBundle,
  tagIndex?: TagIndex,
  bakedNames?: Map<string, { ru: string; en: string }>,
): Record<string, { ru: string; en: string }> {
  const lexicon = new ProductLexicon(bundle);
  const out: Record<string, { ru: string; en: string }> = {};

  for (const id of productIds) {
    const resolved = lexicon.resolvePair(id, { tagIndex, bakedNames });
    const baked = bakedNames?.get(id);
    if (baked && isFallbackName(id, resolved) && !isFallbackName(id, baked)) {
      out[id] = baked;
    } else {
      out[id] = resolved;
    }
  }

  return out;
}

export function collectResolveKeysForIds(
  productIds: Iterable<string>,
  bundle: LangBundle,
): Set<string> {
  const keys = new Set<string>();
  for (const id of productIds) {
    for (const key of collectLangKeysForResolve(id)) keys.add(key);
    const tierRep = gtceuTierRepresentativeItem(id);
    if (tierRep) {
      for (const key of collectLangKeysForResolve(tierRep)) keys.add(key);
    }
  }
  for (const key of collectMaterialPrefixKeys(bundle)) keys.add(key);
  return keys;
}
