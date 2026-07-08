import tierRepresentatives from './gtceu-tier-representatives.json';

type TierKind = keyof typeof tierRepresentatives;

const GTCEU_TIER_KINDS = new Set<string>(Object.keys(tierRepresentatives));

export function parseGtceuTierTag(
  tagId: string,
): { kind: TierKind; tier: string } | null {
  if (!tagId.startsWith('#gtceu:')) return null;
  const body = tagId.slice('#gtceu:'.length);
  const slash = body.indexOf('/');
  if (slash < 0) return null;
  const kind = body.slice(0, slash);
  const tier = body.slice(slash + 1);
  if (!GTCEU_TIER_KINDS.has(kind) || !tier) return null;
  return { kind: kind as TierKind, tier };
}

export function gtceuTierRepresentativeItem(tagId: string): string | null {
  const parsed = parseGtceuTierTag(tagId);
  if (!parsed) return null;
  const table = tierRepresentatives[parsed.kind] as Record<string, string>;
  return table[parsed.tier] ?? null;
}

export { tierRepresentatives as TIER_REPRESENTATIVES };
