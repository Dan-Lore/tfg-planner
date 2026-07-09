import {
  collectLangKeysForResolve,
  fallbackName,
  isFallbackName,
  langKeysForResource,
  pickLang,
} from '../../../../src/shared/product-lexicon/lang-keys.js';
import { gtceuTierRepresentativeItem, parseGtceuTierTag } from '../../../../src/shared/product-lexicon/gtceu-tier-tags.js';
import type { LangBundle } from '../../../../src/shared/product-lexicon/types.js';
import type { LocalizedName } from '../../../../src/data/types.js';
import {
  computeRecipeIoLocalizedByKind,
  type RecipeIoLocalizedStats,
} from './lang-coverage.js';

export type LangMissReason =
  | 'resolved'
  | 'gtceu_tier_tag'
  | 'no_lang_key'
  | 'no_tag_member'
  | 'fallback_only';

export interface NamespaceCoverage {
  localized: number;
  total: number;
  ratio: number;
}

export interface LangCoverageReport extends RecipeIoLocalizedStats {
  langCoverageByNamespace: Record<string, NamespaceCoverage>;
  langMissByReason: Partial<Record<LangMissReason, number>>;
  langMissSample: string[];
  langUnlocalizableSample: string[];
  langAchievableCeiling: number;
}

function productNamespace(id: string): string {
  const body = id.startsWith('#') ? id.slice(1) : id;
  const colon = body.indexOf(':');
  return colon >= 0 ? body.slice(0, colon) : 'unknown';
}

function hasAnyLangKey(id: string, bundle: LangBundle): boolean {
  for (const key of collectLangKeysForResolve(id)) {
    if (bundle.ru[key] || bundle.en[key]) return true;
  }
  return false;
}

export function classifyMissReason(
  id: string,
  bundle: LangBundle,
  resolved: LocalizedName,
): LangMissReason {
  if (!isFallbackName(id, resolved)) return 'resolved';
  if (parseGtceuTierTag(id) && gtceuTierRepresentativeItem(id)) {
    const rep = gtceuTierRepresentativeItem(id)!;
    const keys = langKeysForResource(rep);
    const hit = pickLang(bundle, keys);
    if (hit.ru || hit.en) return 'gtceu_tier_tag';
  }
  if (!hasAnyLangKey(id, bundle)) return 'no_lang_key';
  if (id.startsWith('#')) return 'no_tag_member';
  return 'fallback_only';
}

export function buildLangCoverageReport(
  items: Iterable<string>,
  fluids: Iterable<string>,
  tags: Iterable<string>,
  resolved: Record<string, LocalizedName>,
  bundle: LangBundle,
  missSampleLimit = 40,
): LangCoverageReport {
  const base = computeRecipeIoLocalizedByKind(items, fluids, tags, resolved);
  const allIds = [...items, ...fluids, ...tags];

  const byNs = new Map<string, { localized: number; total: number }>();
  const byReason = new Map<LangMissReason, number>();
  const missSample: string[] = [];
  const unlocalizable: string[] = [];
  let ceilingLocalized = 0;

  for (const id of allIds) {
    const ns = productNamespace(id);
    const entry = byNs.get(ns) ?? { localized: 0, total: 0 };
    entry.total++;
    const names = resolved[id] ?? fallbackName(id);
    const ok = !isFallbackName(id, names);
    if (ok) entry.localized++;
    byNs.set(ns, entry);

    const reason = classifyMissReason(id, bundle, names);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);

    if (!ok) {
      if (missSample.length < missSampleLimit) missSample.push(id);
      if (reason === 'no_lang_key' && unlocalizable.length < missSampleLimit) {
        unlocalizable.push(id);
      }
    }

    if (ok) {
      ceilingLocalized++;
    } else if (reason !== 'no_lang_key') {
      ceilingLocalized++;
    }
  }

  const langCoverageByNamespace: Record<string, NamespaceCoverage> = {};
  for (const [ns, stats] of [...byNs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    langCoverageByNamespace[ns] = {
      localized: stats.localized,
      total: stats.total,
      ratio: stats.total > 0 ? stats.localized / stats.total : 1,
    };
  }

  const langMissByReason: Partial<Record<LangMissReason, number>> = {};
  for (const [reason, count] of byReason) langMissByReason[reason] = count;

  return {
    ...base,
    langCoverageByNamespace,
    langMissByReason,
    langMissSample: missSample,
    langUnlocalizableSample: unlocalizable,
    langAchievableCeiling: allIds.length > 0 ? ceilingLocalized / allIds.length : 1,
  };
}
