import { describe, it, expect } from 'vitest';
import { productMatchesTag } from '@/lib/tag-rules';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/lib/tag-index';
import { resolveResourceName } from '@/lib/product-lexicon';

describe('tag member resolution', () => {
  it('matches double plate structural tags', () => {
    expect(productMatchesTag('#forge:double_plates/steel', 'gtceu:steel_double_plate')).toBe(true);
  });

  it('resolves forge double plate tag via member', () => {
    const meta = {
      items: [
        { id: '#forge:double_plates/steel', names: { ru: 'x', en: 'x' } },
        { id: 'gtceu:steel_double_plate', names: { ru: 'x', en: 'x' } },
      ],
      fluids: [],
    };
    const tagIndex = buildTagIndexForRecipes(meta, [], buildTagIndexFromMeta(meta));
    const members = tagIndex.members.get('#forge:double_plates/steel');
    expect(members?.has('gtceu:steel_double_plate')).toBe(true);

    const bundle = {
      ru: { 'item.gtceu.steel_double_plate': 'Двойная пластина стали' },
      en: { 'item.gtceu.steel_double_plate': 'Steel Double Plate' },
    };
    expect(resolveResourceName('#forge:double_plates/steel', bundle, { tagIndex }).ru).toBe(
      'Двойная пластина стали',
    );
  });
});
