import { describe, expect, it } from 'vitest';
import {
  inferEnergyFromFlatEUt,
  inferEnergyFromFlatEUtDetailed,
  energyFromTierAndAmperage,
} from '../src/energy-parse.js';

describe('energy-parse', () => {
  it('infers ULV 0.25A for 2 EU/t (singleblock)', () => {
    expect(
      inferEnergyFromFlatEUt(2, { kind: 'singleblock' }),
    ).toEqual({
      minVoltageTier: 'ULV',
      voltage: 8,
      amperage: 0.25,
    });
  });

  it('prefers lowest tier with amperage ≤ 1 for singleblock', () => {
    expect(
      inferEnergyFromFlatEUt(32, { kind: 'singleblock' }),
    ).toEqual({
      minVoltageTier: 'LV',
      voltage: 32,
      amperage: 1,
    });
  });

  it('uses lowest exact tier with amperage ≤ 1 when no clean match', () => {
    expect(
      inferEnergyFromFlatEUt(120, { kind: 'singleblock' }),
    ).toEqual({
      minVoltageTier: 'MV',
      voltage: 128,
      amperage: 0.9375,
    });
  });

  it('marks ambiguous when LV fallback is required', () => {
    const result = inferEnergyFromFlatEUtDetailed(999_999, { kind: 'singleblock' });
    expect(result?.ambiguous).toBe(true);
    expect(result?.stack.minVoltageTier).toBe('LV');
  });

  it('prefers native tier for multiblock pyrolyse (96 EU/t → MV 0.75A)', () => {
    expect(
      inferEnergyFromFlatEUt(96, { kind: 'multiblock', nativeTier: 'MV' }),
    ).toEqual({
      minVoltageTier: 'MV',
      voltage: 128,
      amperage: 0.75,
    });
  });

  it('falls back to lowest tier with A ≤ 4 for multiblock without native match', () => {
    expect(
      inferEnergyFromFlatEUt(96, { kind: 'multiblock' }),
    ).toEqual({
      minVoltageTier: 'LV',
      voltage: 32,
      amperage: 3,
    });
  });

  it('builds stack from GTValues.VA tier', () => {
    expect(energyFromTierAndAmperage('MV', 0.5)).toEqual({
      minVoltageTier: 'MV',
      voltage: 128,
      amperage: 0.5,
    });
  });
});
