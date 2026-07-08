import type { TagIndex } from '@/lib/tag-index';
import type { LangBundle } from './types';
import { isFallbackName } from './lang-keys';
import type { ResolveContext } from './types';

type ResolveFn = (
  id: string,
  bundle: LangBundle,
  ctx: ResolveContext,
) => { ru: string; en: string };

/** First tag member with a non-fallback resolved name. */
export function resolveTagMemberFallback(
  tagId: string,
  bundle: LangBundle,
  tagIndex: TagIndex | undefined,
  resolveMember: ResolveFn,
  ctx: ResolveContext,
): { ru?: string; en?: string } {
  if (!tagIndex) return {};
  const members = tagIndex.members.get(tagId);
  if (!members || members.size === 0) return {};

  const sorted = [...members].sort();
  for (const memberId of sorted) {
    const hit = resolveMember(memberId, bundle, { ...ctx, skipTagMember: true });
    if (!isFallbackName(memberId, hit)) {
      return { ru: hit.ru, en: hit.en };
    }
  }
  return {};
}

/** Tag → first member with a baked (pack.meta) non-fallback name. */
export function resolveTagMemberBakedFallback(
  tagId: string,
  tagIndex: TagIndex | undefined,
  bakedNames?: Map<string, { ru: string; en: string }>,
): { ru?: string; en?: string } {
  if (!tagIndex || !bakedNames) return {};
  const members = tagIndex.members.get(tagId);
  if (!members || members.size === 0) return {};

  for (const memberId of [...members].sort()) {
    const baked = bakedNames.get(memberId);
    if (baked && !isFallbackName(memberId, baked)) {
      return { ru: baked.ru, en: baked.en };
    }
  }
  return {};
}
