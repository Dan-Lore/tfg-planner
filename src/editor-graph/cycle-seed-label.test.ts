import { describe, expect, it } from 'vitest';
import {
  buildCycleSeedInspectorLines,
  formatCycleSeedBalanceLabel,
} from '@/editor-graph/cycle-seed-label';
import type { CycleSeedInfo } from '@/calculator/flow-solver-types';

const baseSeed: CycleSeedInfo = {
  edgeId: 'edge_154',
  sccIndex: 0,
  seedFlowPerSecond: 0.0267,
  theoreticalDemandPerSecond: 0.025,
  productId: 'gtceu:tiny_rhenium_dust',
  netPerSecond: 0,
  producePerSecond: 0.025,
  consumePerSecond: 0.025,
  produceAttemptPerSecond: 0.25,
  consumeAttemptPerSecond: 0.25,
  catalystChance: 1000,
  reproductionPercent: 100,
  recommendedCapacity: 111,
  recommendedCapacityDetail: {
    attemptsPerHour: 900,
    chancePercent: 10,
    mean: 90,
    stdDev: 9,
    zScore: 2.33,
  },
  mode: 'stable',
};

describe('formatCycleSeedBalanceLabel', () => {
  it('shows positive consumption rate with approximate prefix for chanced catalyst', () => {
    const label = formatCycleSeedBalanceLabel(((key: string) => key) as never, baseSeed);
    expect(label).toBe('~0.0250/s');
    expect(label).not.toContain('%');
    expect(label).not.toContain('+');
    expect(label).not.toContain('−');
  });

  it('uses absolute consumption when legacy seed lacks consume field', () => {
    const legacy = { ...baseSeed, consumePerSecond: undefined } as unknown as CycleSeedInfo;
    const label = formatCycleSeedBalanceLabel(((key: string) => key) as never, legacy);
    expect(label).toMatch(/\/s$/);
    expect(label).not.toContain('%');
  });
});

describe('buildCycleSeedInspectorLines', () => {
  const t = ((key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  }) as never;

  it('mentions product once, shows attempt production and self-sufficient mode', () => {
    const lines = buildCycleSeedInspectorLines(t, baseSeed, 'Рений');
    const joined = lines.map((l) => l.text).join('\n');
    expect(lines[0]!.text).toContain('Рений');
    expect(joined.split('Рений').length - 1).toBe(1);
    expect(joined).not.toContain('seedEdgeFlow');
    const produceLine = lines.find((l) => l.key === 'produce')!.text;
    expect(produceLine).toContain('0.25');
    const modeLine = lines.find((l) => l.key === 'mode')!.text;
    expect(modeLine).toContain('selfSufficient');
    expect(modeLine).not.toContain('Баланс');
  });

  it('adds tooltip on recommended capacity when detail is present', () => {
    const lines = buildCycleSeedInspectorLines(t, baseSeed, 'Рений');
    const capacityLine = lines.find((l) => l.key === 'recommendedCapacity');
    expect(capacityLine?.title).toContain('recommendedCapacityTooltip');
    expect(capacityLine?.title).toContain('111');
  });
});
