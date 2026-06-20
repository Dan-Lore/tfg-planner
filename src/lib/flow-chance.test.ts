import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import {
  chanceDisplayPercent,
  chanceRateMultiplier,
  formatFlowQuantityLabel,
  formatFlowRateLabel,
  isChancedFlow,
} from '@/lib/flow-chance';

describe('flow-chance', () => {
  it('detects chanced flows below GT base', () => {
    expect(isChancedFlow({ chance: 8000 })).toBe(true);
    expect(isChancedFlow({ chance: 10_000 })).toBe(false);
    expect(isChancedFlow({})).toBe(false);
  });

  it('formats quantity label with percent prefix', () => {
    expect(
      formatFlowQuantityLabel(
        { itemId: 'tfc:wood/log/pine', amount: 16, chance: 8000 },
        'Бревно сосны',
      ),
    ).toBe('80% × 16× Бревно сосны');
  });

  it('applies expected rate multiplier', () => {
    expect(chanceRateMultiplier(8000).toNumber()).toBeCloseTo(0.8, 5);
    expect(chanceDisplayPercent(8000)).toBe(80);
    expect(formatFlowRateLabel(R.from(0.1067), true)).toBe('~0.1067/s');
  });
});
