import { describe, expect, it } from 'vitest';
import { flowsCompatible, flowLookupKeys } from '@/lib/flow-match';
import { buildTagIndex } from '@/lib/tag-index';
import type { PackData } from '@/data/types';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '',
  machines: [],
  items: [],
  fluids: [
    { id: 'gtceu:wood_tar', names: { ru: 'Wood tar', en: 'Wood tar' } },
    { id: '#forge:wood_tar', names: { ru: 'Wood tar', en: 'Wood tar' } },
  ],
  recipes: [],
};

describe('flow-match fluids + forge tags', () => {
  const tags = buildTagIndex(pack);

  it('matches gtceu:wood_tar output to #forge:wood_tar input', () => {
    const out = { fluidId: 'gtceu:wood_tar', amount: 1500 };
    const inp = { fluidId: '#forge:wood_tar', amount: 1000 };
    expect(flowsCompatible(out, inp, tags)).toBe(true);
  });

  it('lookup keys include fluid tag for concrete fluid', () => {
    const keys = flowLookupKeys({ fluidId: 'gtceu:wood_tar', amount: 1 }, tags);
    expect(keys).toContain('fluid:gtceu:wood_tar');
    expect(keys).toContain('fluid:#forge:wood_tar');
  });
});
