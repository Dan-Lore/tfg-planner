import { describe, it, expect } from 'vitest';
import {
  gtceuTierRepresentativeItem,
  parseGtceuTierTag,
} from '@/lib/product-lexicon/gtceu-tier-tags';
import { resolveResourceName } from '@/lib/product-lexicon';

describe('gtceu tier tags', () => {
  it('parses circuits and batteries tier tags', () => {
    expect(parseGtceuTierTag('#gtceu:circuits/mv')).toEqual({
      kind: 'circuits',
      tier: 'mv',
    });
    expect(parseGtceuTierTag('#gtceu:batteries/hv')).toEqual({
      kind: 'batteries',
      tier: 'hv',
    });
    expect(parseGtceuTierTag('#forge:dusts/copper')).toBeNull();
  });

  it('maps tier tags to representative items', () => {
    expect(gtceuTierRepresentativeItem('#gtceu:circuits/mv')).toBe(
      'gtceu:good_electronic_circuit',
    );
    expect(gtceuTierRepresentativeItem('#gtceu:batteries/lv')).toBe(
      'gtceu:lv_lithium_battery',
    );
  });

  it('resolves circuit tier tag via representative item', () => {
    const bundle = {
      ru: { 'item.gtceu.good_electronic_circuit': 'Хорошая электрическая схема' },
      en: { 'item.gtceu.good_electronic_circuit': 'Good Electronic Circuit' },
    };
    expect(resolveResourceName('#gtceu:circuits/mv', bundle).ru).toBe(
      'Хорошая электрическая схема',
    );
  });

  it('resolves battery tier tag via representative item', () => {
    const bundle = {
      ru: { 'item.gtceu.lv_lithium_battery': 'Литиевая батарея (LV)' },
      en: { 'item.gtceu.lv_lithium_battery': 'LV Lithium Battery' },
    };
    expect(resolveResourceName('#gtceu:batteries/lv', bundle).ru).toBe(
      'Литиевая батарея (LV)',
    );
  });
});
